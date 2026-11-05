import assert from 'node:assert/strict';
import test from 'node:test';

import {
  androidPublicConfig,
  findAndroidApp,
  findDatabaseId,
  mergeEnvFile,
  parseCliJson,
  parseWorkersUrl,
  readTomlAssignment,
  replaceTomlAssignment,
  serviceAccountEmail,
  runSetup,
  expoAccountName,
  setupProviders,
  validateProjectId,
} from './setup-providers.mjs';

const PROJECT_ID = 'notifier-personal';
const APP_ID = '1:123456789:android:abcdef';
const DATABASE_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const RELAY_URL = 'https://notifier-relay.example.workers.dev';

const tomlTemplate = `name = "notifier-relay"
[[d1_databases]]
binding = "DB"
database_name = "notifier-relay"
database_id = "replace-with-your-d1-database-id"

[vars]
FIREBASE_PROJECT_ID = "replace-with-your-firebase-project-id"
ANDROID_PACKAGE_NAME = "dev.heytor.notifier"
`;

const sdkConfig = {
  project_info: {
    project_number: '123456789',
    project_id: PROJECT_ID,
  },
  client: [
    {
      client_info: {
        mobilesdk_app_id: APP_ID,
        android_client_info: { package_name: 'dev.heytor.notifier' },
      },
      api_key: [{ current_key: 'public-android-key' }],
    },
  ],
};

test('helpers read public Firebase config and edit only toml assignments', () => {
  assert.equal(expoAccountName('heytorvas\nheytorvas@gmail.com\n'), 'heytorvas');
  assert.equal(validateProjectId(PROJECT_ID), PROJECT_ID);
  assert.throws(() => validateProjectId('replace-with-your-firebase-project-id'));
  assert.equal(serviceAccountEmail(PROJECT_ID), `notifier-relay@${PROJECT_ID}.iam.gserviceaccount.com`);
  assert.deepEqual(androidPublicConfig(sdkConfig), {
    EXPO_PUBLIC_FIREBASE_APPLICATION_ID: APP_ID,
    EXPO_PUBLIC_FIREBASE_API_KEY: 'public-android-key',
    EXPO_PUBLIC_FIREBASE_PROJECT_ID: PROJECT_ID,
    EXPO_PUBLIC_FIREBASE_SENDER_ID: '123456789',
  });
  assert.equal(
    findAndroidApp(
      [{ platform: 'ANDROID', namespace: 'dev.heytor.notifier', appId: APP_ID }],
      'dev.heytor.notifier',
    ).appId,
    APP_ID,
  );
  assert.equal(
    findDatabaseId([{ name: 'notifier-relay', uuid: DATABASE_ID }], 'notifier-relay'),
    DATABASE_ID,
  );
  assert.equal(parseWorkersUrl(`Published ${RELAY_URL}\n`, 'notifier-relay'), RELAY_URL);
  assert.equal(parseCliJson('warning\n{"result":[]}').result.length, 0);

  const updated = replaceTomlAssignment(
    replaceTomlAssignment(tomlTemplate, 'database_id', DATABASE_ID),
    'FIREBASE_PROJECT_ID',
    PROJECT_ID,
  );
  assert.equal(readTomlAssignment(updated, 'database_id'), DATABASE_ID);
  assert.equal(readTomlAssignment(updated, 'FIREBASE_PROJECT_ID'), PROJECT_ID);
  assert.equal(readTomlAssignment(updated, 'ANDROID_PACKAGE_NAME'), 'dev.heytor.notifier');
  assert.equal(updated.match(/database_id/g).length, 1);

  const envFile = mergeEnvFile(
    'KEEP_ME=yes\nEXPO_PUBLIC_RELAY_URL=old\n',
    {
      EXPO_PUBLIC_RELAY_URL: RELAY_URL,
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: PROJECT_ID,
    },
  );
  assert.match(envFile, /^KEEP_ME=yes/m);
  assert.match(envFile, new RegExp(`^EXPO_PUBLIC_RELAY_URL=${RELAY_URL}$`, 'm'));
  assert.throws(() => mergeEnvFile('', { FIREBASE_PRIVATE_KEY: 'secret' }));
});

test('setup creates missing free-tier resources and keeps the private key out of the app env', async () => {
  const io = fakeIo(tomlTemplate);
  io.answer(/projects:list/, { result: [] });
  io.answer(/projects:create/, { result: { projectId: PROJECT_ID } });
  io.answer(/apps:list/, () => ({
    result: io.calls.some((call) => call.args.includes('apps:create'))
      ? [{ platform: 'ANDROID', namespace: 'dev.heytor.notifier', appId: APP_ID }]
      : [],
  }));
  io.answer(/apps:create/, { result: { appId: APP_ID } });
  io.answer(/apps:sdkconfig/, { result: { sdkConfig } });
  io.answer(/services enable/, { result: '' });
  io.answer(/service-accounts describe/, { code: 1, stderr: 'NOT_FOUND' });
  io.answer(/service-accounts create/, { result: '' });
  io.answer(/get-iam-policy/, { result: { bindings: [] } });
  io.answer(/add-iam-policy-binding/, { result: '' });
  io.answer(/secret list/, { code: 1, stderr: 'This Worker does not exist' });
  io.answer(/keys create/, ({ args }) => {
    const keyPath = args[args.indexOf('create') + 1];
    io.files.set(
      keyPath,
      JSON.stringify({
        client_email: serviceAccountEmail(PROJECT_ID),
        private_key: '-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----\n',
      }),
    );
    return { result: '' };
  });
  io.answer(/d1 list/, { result: [] });
  io.answer(/d1 create/, { stdout: `database_id = "${DATABASE_ID}"` });
  io.answer(/migrations apply/, { result: '' });
  io.answer(/wrangler deploy|deploy /, {
    stdout: `Deployed notifier-relay\n${RELAY_URL}\n`,
  });
  io.answer(/eas-cli@latest env:set/, { result: '' });
  io.fetchResult = { status: 'ok' };

  const summary = await setupProviders({ projectId: PROJECT_ID, root: '/repo' }, io);

  assert.equal(summary.relayUrl, RELAY_URL);
  assert.equal(
    readTomlAssignment(io.files.get('/repo/relay/wrangler.toml'), 'database_id'),
    'replace-with-your-d1-database-id',
  );
  const relayEnv = io.files.get('/repo/relay/.env');
  assert.match(relayEnv, new RegExp(`^CLOUDFLARE_D1_DATABASE_ID=${DATABASE_ID}$`, 'm'));
  assert.match(relayEnv, new RegExp(`^FIREBASE_PROJECT_ID=${PROJECT_ID}$`, 'm'));
  assert.match(io.files.get('/repo/relay/.wrangler.local.toml'), new RegExp(`database_id = "${DATABASE_ID}"`));
  assert.doesNotMatch(io.files.get('/repo/relay/.wrangler.local.toml'), /replace-with-your/);
  const envFile = io.files.get('/repo/.env');
  assert.match(envFile, /EXPO_PUBLIC_FIREBASE_API_KEY=public-android-key/);
  assert.doesNotMatch(envFile, /PRIVATE KEY|gserviceaccount/);
  assert.equal(io.secretWrites.length, 1);
  assert.match(io.secretWrites[0].contents, /PRIVATE KEY/);
  assert.equal(io.secretsRemoved, true);
  const joined = io.calls.map((call) => call.args.join(' ')).join('\n');
  assert.match(joined, /services enable fcm\.googleapis\.com/);
  assert.doesNotMatch(joined, /firestore|cloudfunctions|blaze/i);
  assert.match(joined, /roles\/firebasecloudmessaging\.admin/);
  assert.match(joined, /--secrets-file/);
  assert.match(joined, /eas-cli@latest init --account owner/);
});

test('setup reuses an existing project, database, and Worker secrets', async () => {
  const existing = replaceTomlAssignment(
    replaceTomlAssignment(tomlTemplate, 'database_id', DATABASE_ID),
    'FIREBASE_PROJECT_ID',
    PROJECT_ID,
  );
  const io = fakeIo(existing);
  io.files.set(
    '/repo/app.json',
    JSON.stringify({
      expo: {
        android: { package: 'dev.heytor.notifier' },
        extra: { eas: { projectId: 'existing-eas-project' } },
      },
    }),
  );
  io.answer(/projects:list/, { result: [{ projectId: PROJECT_ID }] });
  io.answer(/apps:list/, {
    result: [{ platform: 'ANDROID', namespace: 'dev.heytor.notifier', appId: APP_ID }],
  });
  io.answer(/apps:sdkconfig/, { result: { sdkConfig } });
  io.answer(/services enable/, { result: '' });
  io.answer(/service-accounts describe/, { result: { email: serviceAccountEmail(PROJECT_ID) } });
  io.answer(/get-iam-policy/, {
    result: {
      bindings: [
        {
          role: 'roles/firebasecloudmessaging.admin',
          members: [`serviceAccount:${serviceAccountEmail(PROJECT_ID)}`],
        },
      ],
    },
  });
  io.answer(/secret list/, {
    result: [{ name: 'FIREBASE_CLIENT_EMAIL' }, { name: 'FIREBASE_PRIVATE_KEY' }],
  });
  io.answer(/migrations apply/, { result: '' });
  io.answer(/deploy/, { stdout: RELAY_URL });
  io.answer(/env:set/, { result: '' });
  io.fetchResult = { status: 'ok' };

  await setupProviders({ root: '/repo' }, io);

  const joined = io.calls.map((call) => call.args.join(' ')).join('\n');
  assert.doesNotMatch(joined, /projects:create|apps:create|d1 create|keys create|add-iam-policy-binding/);
  assert.equal(io.secretWrites.length, 0);
  assert.doesNotMatch(joined, /--secrets-file/);
  assert.doesNotMatch(joined, /eas-cli@latest init/);
});

test('setup stops before any provider change when a login is missing', async () => {
  const io = fakeIo(tomlTemplate);
  io.answer(/login:list/, { code: 1, stderr: 'not logged in' });
  io.answer(/auth list/, { result: [] });
  io.answer(/whoami/, { code: 1, stderr: 'You are not authenticated' });

  await assert.rejects(
    () => setupProviders({ projectId: PROJECT_ID, root: '/repo', skipEas: true }, io),
    (error) => {
      assert.match(error.message, /firebase-tools@latest login/);
      assert.match(error.message, /gcloud auth login/);
      assert.match(error.message, /wrangler login/);
      return true;
    },
  );
  const joined = io.calls.map((call) => call.args.join(' ')).join('\n');
  assert.doesNotMatch(joined, /projects:create|d1 create|deploy/);
});

test('cli awaits the io object before reading the repository', async () => {
  let reads = 0;
  await assert.rejects(
    () =>
      runSetup({ projectId: PROJECT_ID, root: '/repo' }, async () => {
        await Promise.resolve();
        return {
          async readText() {
            reads += 1;
            throw new Error('opened');
          },
        };
      }),
    /opened/,
  );
  assert.equal(reads, 1);
});

test('dry run does not deploy or write secrets', async () => {
  const io = fakeIo(tomlTemplate);
  io.answer(/projects:list/, { result: [{ projectId: PROJECT_ID }] });
  io.answer(/apps:list/, { result: [] });
  io.answer(/d1 list/, { result: [] });
  io.answer(/service-accounts describe/, { code: 1, stderr: 'NOT_FOUND' });
  io.answer(/get-iam-policy/, { result: { bindings: [] } });
  io.answer(/secret list/, { code: 1, stderr: 'This Worker does not exist' });

  const summary = await setupProviders(
    { projectId: PROJECT_ID, root: '/repo', skipEas: true, dryRun: true },
    io,
  );

  assert.equal(summary.dryRun, true);
  assert.equal(io.files.has('/repo/.env'), false);
  assert.equal(io.secretWrites.length, 0);
  const joined = io.calls.map((call) => call.args.join(' ')).join('\n');
  assert.doesNotMatch(joined, /projects:create|apps:create|d1 create|keys create|deploy/);
});

function fakeIo(toml) {
  const files = new Map([
    ['/repo/app.json', JSON.stringify({ expo: { android: { package: 'dev.heytor.notifier' } } })],
    ['/repo/relay/wrangler.toml', toml],
  ]);
  const matchers = [];
  const calls = [];
  const secretWrites = [];
  const io = {
    files,
    calls,
    secretWrites,
    secretsRemoved: false,
    fetchResult: { status: 'ok' },
    answer(pattern, response) {
      matchers.push({ pattern, response });
    },
    async secretPath(name) {
      await Promise.resolve();
      return `/tmp/notifier-setup/${name}`;
    },
    async writeSecret(name, contents) {
      const filePath = `/tmp/notifier-setup/${name}`;
      secretWrites.push({ name, contents, filePath });
      files.set(filePath, contents);
      return filePath;
    },
    async removeSecrets() {
      io.secretsRemoved = true;
    },
    async readText(filePath) {
      if (!files.has(filePath)) throw new Error(`missing ${filePath}`);
      return files.get(filePath);
    },
    async writeText(filePath, contents) {
      if (filePath.startsWith('/tmp/')) throw new Error('repo write used a secret path');
      files.set(filePath, contents);
    },
    log() {},
    async fetch(url) {
      assert.equal(url, `${RELAY_URL}/health`);
      return {
        ok: true,
        async json() {
          return io.fetchResult;
        },
      };
    },
    async run(invocation) {
      calls.push(invocation);
      const text = `${invocation.command} ${invocation.args.join(' ')}`;
      const matched = matchers.findLast((candidate) => candidate.pattern.test(text));
      if (!matched) throw new Error(`Unexpected command: ${text}`);
      const response =
        typeof matched.response === 'function' ? matched.response(invocation) : matched.response;
      const isFirebase = invocation.args.includes('firebase-tools@latest');
      const stdout =
        response.stdout ??
        (response.result === undefined || response.result === ''
          ? ''
          : JSON.stringify(
              isFirebase ? { status: 'success', result: response.result } : response.result,
            ));
      return { code: response.code ?? 0, stdout, stderr: response.stderr ?? '' };
    },
  };
  io.answer(/login:list/, { result: [{ user: { email: 'owner@example.com' } }] });
  io.answer(/auth list/, { result: [{ account: 'owner@example.com', status: 'ACTIVE' }] });
  io.answer(/wrangler whoami|whoami$/, { stdout: 'You are logged in' });
  io.answer(/eas-cli@latest whoami/, { stdout: 'owner\nowner@example.com\n' });
  io.answer(/eas-cli@latest init/, { stdout: 'Created @owner/notifier' });
  return io;
}
