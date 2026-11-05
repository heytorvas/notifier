import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { renderWranglerConfig } from './relay-config.mjs';

const DATABASE_NAME = 'notifier-relay';
const SERVICE_ACCOUNT_NAME = 'notifier-relay';
const FCM_ROLE = 'roles/firebasecloudmessaging.admin';
const FCM_API = 'fcm.googleapis.com';

const PLACEHOLDER_DATABASE_ID = 'replace-with-your-d1-database-id';
const PLACEHOLDER_PROJECT_ID = 'replace-with-your-firebase-project-id';
const PLACEHOLDER_EAS_PROJECT_ID = '00000000-0000-0000-0000-000000000000';
const DEPLOYMENT_ENV_KEYS = new Set([
  'CLOUDFLARE_D1_DATABASE_ID',
  'FIREBASE_PROJECT_ID',
  'EAS_PROJECT_ID',
  'EXPO_OWNER',
]);
const WORKER_SECRET_NAMES = ['FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function validateProjectId(projectId) {
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
    throw new Error(
      'The Firebase project id must be 6–30 characters and use lowercase letters, digits, and hyphens.',
    );
  }
  return projectId;
}

export function serviceAccountEmail(projectId) {
  return `${SERVICE_ACCOUNT_NAME}@${projectId}.iam.gserviceaccount.com`;
}

export function parseCliJson(text) {
  const start = text.search(/[[{]/);
  if (start === -1) throw new Error('Command returned no JSON.');
  return JSON.parse(text.slice(start));
}

export function commandJson(text) {
  const parsed = parseCliJson(text);
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && 'result' in parsed) {
    return parsed.result;
  }
  return parsed;
}

export function findAndroidApp(apps, packageName) {
  return (Array.isArray(apps) ? apps : []).find((app) => {
    const appPackage = app.namespace ?? app.packageName ?? app.package_name;
    const platform = String(app.platform ?? '').toUpperCase();
    return platform === 'ANDROID' && appPackage === packageName;
  });
}

export function androidPublicConfig(config) {
  const projectNumber = config?.project_info?.project_number;
  const projectId = config?.project_info?.project_id;
  const clients = config?.client ?? [];
  const client = config?.expectedPackage
    ? clients.find(
        (entry) => entry.client_info?.android_client_info?.package_name === config.expectedPackage,
      )
    : clients[0];
  const applicationId = client?.client_info?.mobilesdk_app_id;
  const apiKey = client?.api_key?.[0]?.current_key;
  if (!projectNumber || !projectId || !applicationId || !apiKey) {
    throw new Error('Firebase SDK config is missing the Android app id, API key, project id, or sender id.');
  }
  return {
    EXPO_PUBLIC_FIREBASE_APPLICATION_ID: String(applicationId),
    EXPO_PUBLIC_FIREBASE_API_KEY: String(apiKey),
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: String(projectId),
    EXPO_PUBLIC_FIREBASE_SENDER_ID: String(projectNumber),
  };
}

export function unwrapSdkConfig(value) {
  let current = value;
  if (current && typeof current === 'object' && current.sdkConfig) current = current.sdkConfig;
  if (typeof current === 'string') current = JSON.parse(current);
  if (current?.fileContents && !current.project_info) {
    current = JSON.parse(current.fileContents);
  }
  return current;
}

export function findDatabaseId(list, name) {
  const rows = Array.isArray(list) ? list : (list?.result ?? []);
  const matches = rows.filter((row) => row.name === name || row.database_name === name);
  if (matches.length > 1) throw new Error(`More than one D1 database is named ${name}.`);
  const row = matches[0];
  return row ? (row.uuid ?? row.database_id) : undefined;
}

export function parseDatabaseId(text) {
  const match = text.match(/database_id\s*=\s*"([0-9a-fA-F-]{36})"/);
  if (!match) throw new Error('Wrangler did not print a D1 database id.');
  return match[1];
}

export function parseWorkersUrl(text, workerName) {
  const matches = text.match(/https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev/g) ?? [];
  const preferred = matches.find((url) => url.startsWith(`https://${workerName}.`));
  const url = preferred ?? matches[0];
  if (!url) throw new Error('Deploy did not print an HTTPS workers.dev URL.');
  return url;
}

export function readTomlAssignment(toml, key) {
  const match = toml.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm'));
  if (!match) throw new Error(`wrangler.toml is missing ${key}.`);
  return match[1];
}

export function replaceTomlAssignment(toml, key, value) {
  if (!/^[A-Za-z0-9_.:-]+$/.test(value)) throw new Error(`Refusing to write ${key}.`);
  const pattern = new RegExp(`^(${key}\\s*=\\s*")[^"]*(")`, 'm');
  if (!pattern.test(toml)) throw new Error(`wrangler.toml is missing ${key}.`);
  return toml.replace(pattern, (_match, prefix, suffix) => `${prefix}${value}${suffix}`);
}

export function readEnvValue(contents, key) {
  const match = contents.match(new RegExp(`^${key}=(.*)$`, 'm'));
  const value = match?.[1]?.trim();
  return value || undefined;
}

function deploymentValue(envContents, toml, envKey, placeholder) {
  const fromEnv = readEnvValue(envContents, envKey);
  if (fromEnv && fromEnv !== placeholder) return fromEnv;
  const tomlKey = envKey === 'CLOUDFLARE_D1_DATABASE_ID' ? 'database_id' : envKey;
  try {
    const fromToml = readTomlAssignment(toml, tomlKey);
    return fromToml === placeholder ? undefined : fromToml;
  } catch {
    return undefined;
  }
}

export function mergeEnvFile(existing, updates) {
  for (const key of Object.keys(updates)) {
    if (!key.startsWith('EXPO_PUBLIC_') && !DEPLOYMENT_ENV_KEYS.has(key)) {
      throw new Error(`Refusing to write non-public environment key ${key}.`);
    }
  }
  const lines = existing === '' ? [] : existing.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  const seen = new Set();
  const next = lines.map((line) => {
    const match = /^([A-Z0-9_]+)=/.exec(line);
    if (!match || !(match[1] in updates)) return line;
    seen.add(match[1]);
    return `${match[1]}=${updates[match[1]]}`;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) next.push(`${key}=${value}`);
  }
  return `${next.join('\n')}\n`;
}

export async function setupProviders(options, io) {
  const root = options.root ?? rootDirectory;
  const app = JSON.parse(await io.readText(path.join(root, 'app.json')));
  const packageName = app.expo?.android?.package;
  if (!packageName) throw new Error('app.json is missing expo.android.package.');
  const wranglerPath = path.join(root, 'relay', 'wrangler.toml');
  let toml = await io.readText(wranglerPath);
  const workerName = readTomlAssignment(toml, 'name');
  const configuredPackage = readTomlAssignment(toml, 'ANDROID_PACKAGE_NAME');
  if (configuredPackage !== packageName) {
    throw new Error('app.json and wrangler.toml use different Android package names.');
  }

  const relayEnvPath = path.join(root, 'relay', '.env');
  const relayEnv = await readOptional(io, relayEnvPath);
  const configuredProjectId = deploymentValue(relayEnv, toml, 'FIREBASE_PROJECT_ID', PLACEHOLDER_PROJECT_ID);
  const requestedProjectId = options.projectId ?? configuredProjectId;
  if (!requestedProjectId) {
    throw new Error(
      'Pass the Firebase project id:\n  npm run setup:providers -- --project-id your-project-id\nIf that project does not exist yet, the command creates it on the Spark plan.',
    );
  }
  const projectId = validateProjectId(requestedProjectId);
  await assertSignedIn(io, root, options.skipEas);

  const projectExists = await firebaseProjectExists(io, root, projectId);
  const androidApp = projectExists
    ? await findExistingAndroidApp(io, root, projectId, packageName)
    : undefined;
  const databaseIdInFile = deploymentValue(relayEnv, toml, 'CLOUDFLARE_D1_DATABASE_ID', PLACEHOLDER_DATABASE_ID)
    ?? (readTomlAssignment(toml, 'database_id') === PLACEHOLDER_DATABASE_ID
      ? undefined
      : readTomlAssignment(toml, 'database_id'));
  const listedDatabaseId = databaseIdInFile ?? (await findExistingDatabase(io, root));
  const accountEmail = serviceAccountEmail(projectId);
  const accountExists = projectExists
    ? await serviceAccountExists(io, projectId, accountEmail)
    : false;
  const roleExists = accountExists
    ? await serviceAccountHasRole(io, projectId, accountEmail)
    : false;
  const secretsExist = await workerSecretsExist(io, root);

  const plan = {
    projectId,
    createProject: !projectExists,
    createApp: !androidApp,
    createServiceAccount: !accountExists,
    bindRole: !roleExists,
    createDatabase: !listedDatabaseId,
    createSecrets: !secretsExist,
    relayUrl: undefined,
  };
  if (options.dryRun) {
    io.log(formatPlan(plan));
    return { ...plan, dryRun: true };
  }

  if (!projectExists) {
    io.log(`Creating Firebase project ${projectId} on the Spark plan.`);
    await runChecked(io, firebase(root, ['projects:create', projectId, '--display-name', options.displayName ?? 'Notifier']));
  }
  let appId = androidApp?.appId;
  if (!appId) {
    io.log(`Creating the Android app ${packageName}.`);
    await runChecked(
      io,
      firebase(root, [
        'apps:create',
        'ANDROID',
        options.displayName ?? 'Notifier',
        '--package-name',
        packageName,
        '--project',
        projectId,
      ]),
    );
    appId = findAndroidApp(await listAndroidApps(io, root, projectId), packageName)?.appId;
  }
  if (!appId) throw new Error('Firebase did not return an Android app id.');
  const configText = await runChecked(
    io,
    firebase(root, ['apps:sdkconfig', 'ANDROID', appId, '--project', projectId]),
  );
  const publicConfig = androidPublicConfig({
    ...unwrapSdkConfig(commandJson(configText.stdout)),
    expectedPackage: packageName,
  });
  if (publicConfig.EXPO_PUBLIC_FIREBASE_PROJECT_ID !== projectId) {
    throw new Error('Firebase returned a different project id than the one requested.');
  }

  io.log(`Enabling ${FCM_API}.`);
  await runChecked(io, {
    command: 'gcloud',
    args: ['services', 'enable', FCM_API, '--project', projectId],
  });
  if (!accountExists) {
    io.log(`Creating service account ${SERVICE_ACCOUNT_NAME}.`);
    await runChecked(io, {
      command: 'gcloud',
      args: [
        'iam',
        'service-accounts',
        'create',
        SERVICE_ACCOUNT_NAME,
        '--project',
        projectId,
        '--display-name',
        'Notifier relay',
      ],
    });
  }
  if (!roleExists) {
    io.log(`Granting only ${FCM_ROLE}.`);
    await runChecked(io, {
      command: 'gcloud',
      args: [
        'projects',
        'add-iam-policy-binding',
        projectId,
        `--member=serviceAccount:${accountEmail}`,
        `--role=${FCM_ROLE}`,
        '--condition=None',
      ],
    });
  }

  let databaseId = listedDatabaseId;
  if (!databaseId) {
    io.log(`Creating D1 database ${DATABASE_NAME}.`);
    const created = await runChecked(io, wrangler(root, ['d1', 'create', DATABASE_NAME]));
    databaseId = parseDatabaseId(created.stdout);
  }
  await io.writeText(
    relayEnvPath,
    mergeEnvFile(relayEnv, {
      CLOUDFLARE_D1_DATABASE_ID: databaseId,
      FIREBASE_PROJECT_ID: projectId,
    }),
  );
  await io.writeText(
    path.join(root, 'relay', '.wrangler.local.toml'),
    renderWranglerConfig(toml, {
      CLOUDFLARE_D1_DATABASE_ID: databaseId,
      FIREBASE_PROJECT_ID: projectId,
    }),
  );
  await runChecked(io, wrangler(root, [
    'd1',
    'migrations',
    'apply',
    DATABASE_NAME,
    '--remote',
    '--config',
    '.wrangler.local.toml',
  ]));

  let secretsFile;
  let unusedKeyId;
  try {
    if (!secretsExist) {
      const keyPath = await io.secretPath('firebase-service-account.json');
      io.log('Creating a Firebase service-account key outside the repository.');
      const createdKey = await runChecked(io, {
        command: 'gcloud',
        args: [
          'iam',
          'service-accounts',
          'keys',
          'create',
          keyPath,
          '--iam-account',
          accountEmail,
          '--project',
          projectId,
        ],
      });
      unusedKeyId = createdKey.stdout.match(/created key \[([^\]]+)\]/)?.[1];
      const key = JSON.parse(await io.readText(keyPath));
      if (key.client_email !== accountEmail || typeof key.private_key !== 'string') {
        throw new Error('The service-account key is missing client_email or private_key.');
      }
      secretsFile = await io.writeSecret(
        'worker-secrets.json',
        JSON.stringify({
          FIREBASE_CLIENT_EMAIL: key.client_email,
          FIREBASE_PRIVATE_KEY: key.private_key,
        }),
      );
    }
    io.log('Deploying the relay.');
    const deployed = await runChecked(io, wrangler(root, [
      'deploy',
      '--config',
      '.wrangler.local.toml',
      ...(secretsFile ? ['--secrets-file', secretsFile] : []),
    ]));
    unusedKeyId = undefined;
    const relayUrl = parseWorkersUrl(`${deployed.stdout}\n${deployed.stderr}`, workerName);
    const health = await io.fetch(`${relayUrl}/health`);
    const body = await health.json();
    if (!health.ok || body.status !== 'ok') throw new Error(`Relay health check failed for ${relayUrl}.`);

    const envPath = path.join(root, '.env');
    const currentEnv = await readOptional(io, envPath);
    const envValues = { EXPO_PUBLIC_RELAY_URL: relayUrl, ...publicConfig };
    await io.writeText(envPath, mergeEnvFile(currentEnv, envValues));
    if (!options.skipEas) {
      await ensureEasProject(io, root);
      io.log('Writing EAS preview environment variables.');
      for (const [name, value] of Object.entries(envValues)) {
        await runChecked(io, {
          command: 'npx',
          args: [
            '-y',
            'eas-cli@latest',
            'env:set',
            '--environment',
            'preview',
            '--visibility',
            'plaintext',
            '--name',
            name,
            '--value',
            value,
            '--non-interactive',
          ],
          cwd: root,
        });
      }
    }
    io.log(`Relay is ${relayUrl}`);
    return { projectId, relayUrl, packageName, dryRun: false };
  } catch (error) {
    if (unusedKeyId) {
      await io.run({
        command: 'gcloud',
        args: [
          'iam',
          'service-accounts',
          'keys',
          'delete',
          unusedKeyId,
          '--iam-account',
          accountEmail,
          '--project',
          projectId,
          '--quiet',
        ],
      });
    }
    throw error;
  } finally {
    await io.removeSecrets();
  }
}

export function expoAccountName(text) {
  const name = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!name || name.includes('@')) {
    throw new Error('Could not read the Expo account name. Run npx eas-cli@latest whoami.');
  }
  return name;
}

async function ensureEasProject(io, root) {
  const fromEnv = readEnvValue(await readOptional(io, path.join(root, '.env')), 'EAS_PROJECT_ID');
  if (fromEnv && fromEnv !== PLACEHOLDER_EAS_PROJECT_ID) return;
  const app = JSON.parse(await io.readText(path.join(root, 'app.json')));
  const projectId = app.expo?.extra?.eas?.projectId;
  if (projectId && projectId !== PLACEHOLDER_EAS_PROJECT_ID) return;
  const whoami = await runChecked(io, {
    command: 'npx',
    args: ['-y', 'eas-cli@latest', 'whoami', '--non-interactive'],
    cwd: root,
  });
  const account = expoAccountName(whoami.stdout);
  io.log(`Creating the EAS project on ${account}.`);
  await runChecked(io, {
    command: 'npx',
    args: ['-y', 'eas-cli@latest', 'init', '--account', account, '--non-interactive'],
    cwd: root,
  });
}

function formatPlan(plan) {
  const lines = [
    `Project: ${plan.projectId}`,
    plan.createProject ? 'Would create the Firebase project.' : 'Firebase project already exists.',
    plan.createApp ? 'Would create the Android app.' : 'Android app already exists.',
    plan.createServiceAccount ? 'Would create the notifier-relay service account.' : 'Service account already exists.',
    plan.bindRole ? `Would grant ${FCM_ROLE}.` : 'Messaging admin role already granted.',
    plan.createDatabase ? 'Would create the D1 database.' : 'D1 database already exists.',
    plan.createSecrets ? 'Would create a service-account key and upload Worker secrets.' : 'Worker secrets already exist.',
    'Would apply D1 migrations, deploy, write .env, and sync EAS when not skipped.',
  ];
  return lines.join('\n');
}

async function assertSignedIn(io, root, skipEas) {
  const firebaseLogin = await io.run(firebase(root, ['login:list']));
  const gcloudLogin = await io.run({
    command: 'gcloud',
    args: ['auth', 'list', '--filter=status:ACTIVE', '--format=json'],
  });
  const wranglerLogin = await io.run(wrangler(root, ['whoami']));
  const easLogin = skipEas ? undefined : await io.run({
    command: 'npx',
    args: ['-y', 'eas-cli@latest', 'whoami', '--non-interactive'],
    cwd: root,
  });
  const missing = [];
  if (firebaseLogin.code !== 0) missing.push('npx -y firebase-tools@latest login');
  if (gcloudLogin.code !== 0 || activeAccounts(gcloudLogin.stdout).length === 0) {
    missing.push('gcloud auth login');
  }
  if (!wranglerAuthenticated(wranglerLogin)) missing.push('cd relay && npx wrangler login');
  if (easLogin && easLogin.code !== 0) missing.push('npx eas-cli@latest login');
  if (missing.length > 0) {
    throw new Error(`Sign in, then rerun setup:\n${missing.join('\n')}`);
  }
}

function activeAccounts(text) {
  try {
    const parsed = commandJson(text || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function wranglerAuthenticated(result) {
  return result.code === 0 && !/not authenticated/i.test(`${result.stdout}\n${result.stderr}`);
}

async function firebaseProjectExists(io, root, projectId) {
  const listed = await runChecked(io, firebase(root, ['projects:list']));
  const projects = commandJson(listed.stdout);
  return (Array.isArray(projects) ? projects : []).some((project) => project.projectId === projectId);
}

async function findExistingAndroidApp(io, root, projectId, packageName) {
  try {
    return findAndroidApp(await listAndroidApps(io, root, projectId), packageName);
  } catch (error) {
    if (!/not found|does not exist/i.test(String(error))) throw error;
    return undefined;
  }
}

async function listAndroidApps(io, root, projectId) {
  const listed = await runChecked(io, firebase(root, ['apps:list', '--project', projectId]));
  const apps = commandJson(listed.stdout);
  return Array.isArray(apps) ? apps : [];
}

async function findExistingDatabase(io, root) {
  const listed = await runChecked(io, wrangler(root, ['d1', 'list', '--json']));
  return findDatabaseId(commandJson(listed.stdout), DATABASE_NAME);
}

async function serviceAccountExists(io, projectId, email) {
  const described = await io.run({
    command: 'gcloud',
    args: ['iam', 'service-accounts', 'describe', email, '--project', projectId, '--format=json'],
  });
  if (described.code === 0) return true;
  if (/not_found|not found|does not exist/i.test(`${described.stderr}\n${described.stdout}`)) return false;
  throw commandError({ command: 'gcloud', args: ['iam', 'service-accounts', 'describe', email] }, described);
}

async function serviceAccountHasRole(io, projectId, email) {
  const policy = await runChecked(io, {
    command: 'gcloud',
    args: ['projects', 'get-iam-policy', projectId, '--format=json'],
  });
  const parsed = commandJson(policy.stdout);
  const member = `serviceAccount:${email}`;
  return (parsed.bindings ?? []).some(
    (binding) => binding.role === FCM_ROLE && (binding.members ?? []).includes(member),
  );
}

async function workerSecretsExist(io, root) {
  const listed = await io.run(wrangler(root, ['secret', 'list']));
  if (listed.code !== 0) {
    if (/does not exist|not found|10007/i.test(`${listed.stderr}\n${listed.stdout}`)) return false;
    throw commandError(wrangler(root, ['secret', 'list']), listed);
  }
  const secrets = commandJson(listed.stdout);
  const names = new Set((Array.isArray(secrets) ? secrets : []).map((secret) => secret.name));
  return WORKER_SECRET_NAMES.every((name) => names.has(name));
}

function firebase(root, args) {
  return {
    command: 'npx',
    args: ['-y', 'firebase-tools@latest', ...args, '--json', '--non-interactive'],
    cwd: root,
  };
}

function wrangler(root, args) {
  return {
    command: path.join(root, 'relay', 'node_modules', '.bin', 'wrangler'),
    args,
    cwd: path.join(root, 'relay'),
  };
}

async function runChecked(io, invocation) {
  const result = await io.run(invocation);
  if (result.code !== 0) throw commandError(invocation, result);
  return result;
}

function commandError(invocation, result) {
  const detail = redact(`${result.stderr}\n${result.stdout}`.trim()).slice(0, 2000);
  let hint = '';
  if (/billing/i.test(detail)) {
    hint =
      '\nStay on the Firebase Spark plan. Enable the Firebase Cloud Messaging API in Google Cloud, then rerun this command.';
  } else if (/already a project with ID/i.test(detail)) {
    hint = '\nThat Firebase project id is already taken. Choose a different --project-id and rerun.';
  } else if (result.code === 127 && invocation.command === 'gcloud') {
    hint = '\nInstall the Google Cloud CLI: https://cloud.google.com/sdk/docs/install';
  } else if (result.code === 127 && invocation.command.includes(`${path.sep}wrangler`)) {
    hint = '\nRun npm run relay:install, then sign in with: cd relay && npx wrangler login';
  }
  return new Error(`${invocation.args.join(' ')} failed.\n${detail}${hint}`);
}

function redact(text) {
  return text
    .replace(/-----BEGIN PRIVATE KEY-----[\s\S]*?-----END PRIVATE KEY-----/g, '[redacted private key]')
    .replace(/"private_key"\s*:\s*"[^"]*"/g, '"private_key":"[redacted]"');
}

async function readOptional(io, filePath) {
  try {
    return await io.readText(filePath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return '';
    if (/ENOENT|missing/i.test(String(error))) return '';
    throw error;
  }
}

function createRealIo() {
  let secretDirectory;
  return {
    async readText(filePath) {
      return readFile(filePath, 'utf8');
    },
    async writeText(filePath, contents) {
      if (secretDirectory && filePath.startsWith(secretDirectory)) {
        throw new Error('Refusing to write a secret through the repository file writer.');
      }
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, contents, 'utf8');
    },
    secretPath(name) {
      if (!secretDirectory) throw new Error('Secret directory was not created.');
      if (!/^[\w.-]+$/.test(name)) throw new Error('Invalid secret file name.');
      return path.join(secretDirectory, name);
    },
    async writeSecret(name, contents) {
      const filePath = this.secretPath(name);
      await writeFile(filePath, contents, { encoding: 'utf8', mode: 0o600 });
      return filePath;
    },
    async removeSecrets() {
      if (!secretDirectory) return;
      await rm(secretDirectory, { recursive: true, force: true });
      secretDirectory = undefined;
    },
    async ensureSecretDirectory() {
      if (!secretDirectory) {
        secretDirectory = await mkdtemp(path.join(tmpdir(), 'notifier-setup-'));
      }
    },
    log(message) {
      process.stderr.write(`${message}\n`);
    },
    fetch(url) {
      return fetch(url);
    },
    run(invocation) {
      const command = invocation.command === 'gcloud' ? gcloudBinary() : invocation.command;
      return runProcess({ ...invocation, command });
    },
  };
}

function gcloudBinary() {
  const candidates = [
    process.env.GCLOUD_BIN,
    path.join(homedir(), 'google-cloud-sdk', 'bin', 'gcloud'),
    '/usr/lib/google-cloud-sdk/bin/gcloud',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next known install location.
    }
  }
  return 'gcloud';
}

function runProcess(invocation) {
  return new Promise((resolve) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      env: { ...process.env, CI: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      resolve({ code: 127, stdout, stderr: `${stderr}\n${error.message}` });
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function parseArgs(argv) {
  const options = { displayName: 'Notifier', skipEas: false, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--skip-eas') options.skipEas = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--project-id') options.projectId = argv[++index];
    else if (arg === '--display-name') options.displayName = argv[++index];
    else throw new Error(`Unknown argument ${arg}.`);
  }
  return options;
}

function helpText() {
  return `Usage: npm run setup:providers -- --project-id <firebase-project-id>

Creates or reuses a Spark Firebase project, the Android app, a least-privilege
FCM service account, Cloudflare D1, Worker secrets, and the EAS preview variables.
The service-account private key is written only to a temporary directory and then deleted.

Options:
  --project-id <id>   Firebase project id. Created when it does not already exist.
  --display-name <n>  Display name for a new Firebase project or Android app.
  --skip-eas          Do not write EAS environment variables.
  --dry-run           Show what would change without calling mutating APIs.
`;
}

export async function runSetup(options, open = openIo) {
  return setupProviders(options, await open());
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(helpText());
    return;
  }
  await runSetup(options);
}

async function openIo() {
  const io = createRealIo();
  let opened = false;
  const ensure = async () => {
    if (!opened) {
      await io.ensureSecretDirectory();
      opened = true;
    }
  };
  return {
    readText: (filePath) => io.readText(filePath),
    writeText: (filePath, contents) => io.writeText(filePath, contents),
    async secretPath(name) {
      await ensure();
      return io.secretPath(name);
    },
    async writeSecret(name, contents) {
      await ensure();
      return io.writeSecret(name, contents);
    },
    removeSecrets: () => io.removeSecrets(),
    log: (message) => io.log(message),
    fetch: (url) => io.fetch(url),
    run: (invocation) => io.run(invocation),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
