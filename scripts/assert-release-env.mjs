import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PLACEHOLDER_EAS_PROJECT_ID,
  PLACEHOLDER_EXPO_OWNER,
  resolveExpoIdentity,
} from '../src/config/publicAppConfig.js';

const PUBLIC_KEYS = [
  'EXPO_PUBLIC_RELAY_URL',
  'EXPO_PUBLIC_FIREBASE_APPLICATION_ID',
  'EXPO_PUBLIC_FIREBASE_API_KEY',
  'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
  'EXPO_PUBLIC_FIREBASE_SENDER_ID',
];

const PLACEHOLDER_VALUES = new Set([
  'replace-me',
  'replace-with-your-firebase-project-id',
  '000000000000',
  '1:000000000000:android:replace-me',
  'https://notifier-relay.your-subdomain.workers.dev',
]);

export function findReleaseEnvProblems(env) {
  const identity = resolveExpoIdentity({
    projectId: env.EAS_PROJECT_ID,
    updatesUrl: env.EXPO_PUBLIC_UPDATES_URL,
    owner: env.EXPO_OWNER,
  });
  const problems = [];
  if (identity.projectId === PLACEHOLDER_EAS_PROJECT_ID) problems.push('EAS_PROJECT_ID');
  if (identity.owner === PLACEHOLDER_EXPO_OWNER) problems.push('EXPO_OWNER');
  if (identity.updatesUrl !== `https://u.expo.dev/${identity.projectId}`) {
    problems.push('EXPO_PUBLIC_UPDATES_URL');
  }
  for (const key of PUBLIC_KEYS) {
    const value = typeof env[key] === 'string' ? env[key].trim() : '';
    if (!value || PLACEHOLDER_VALUES.has(value)) problems.push(key);
    else if (key === 'EXPO_PUBLIC_RELAY_URL' && !value.startsWith('https://')) problems.push(key);
  }
  return [...new Set(problems)];
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entry === fileURLToPath(import.meta.url)) {
  const problems = findReleaseEnvProblems(process.env);
  if (problems.length > 0) {
    console.error(
      `Refusing to publish because the EAS preview environment is incomplete: ${problems.join(', ')}`,
    );
    process.exit(1);
  }
}
