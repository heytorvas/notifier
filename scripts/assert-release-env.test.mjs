import assert from 'node:assert/strict';
import test from 'node:test';

import { findReleaseEnvProblems } from './assert-release-env.mjs';

const ready = {
  EAS_PROJECT_ID: '11111111-1111-1111-1111-111111111111',
  EXPO_PUBLIC_UPDATES_URL: 'https://u.expo.dev/11111111-1111-1111-1111-111111111111',
  EXPO_OWNER: 'heytorvas',
  EXPO_PUBLIC_RELAY_URL: 'https://notifier-relay.example.workers.dev',
  EXPO_PUBLIC_FIREBASE_APPLICATION_ID: '1:123456789:android:abcdef',
  EXPO_PUBLIC_FIREBASE_API_KEY: 'public-api-key',
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'notifier-personal',
  EXPO_PUBLIC_FIREBASE_SENDER_ID: '123456789',
};

test('accepts a complete preview environment', () => {
  assert.deepEqual(findReleaseEnvProblems(ready), []);
});

test('rejects committed placeholders', () => {
  const problems = findReleaseEnvProblems({
    ...ready,
    EAS_PROJECT_ID: '00000000-0000-0000-0000-000000000000',
    EXPO_OWNER: 'your-expo-account',
    EXPO_PUBLIC_RELAY_URL: 'https://notifier-relay.your-subdomain.workers.dev',
    EXPO_PUBLIC_FIREBASE_API_KEY: 'replace-me',
  });
  assert.deepEqual(problems, [
    'EAS_PROJECT_ID',
    'EXPO_OWNER',
    'EXPO_PUBLIC_UPDATES_URL',
    'EXPO_PUBLIC_RELAY_URL',
    'EXPO_PUBLIC_FIREBASE_API_KEY',
  ]);
});

test('rejects an updates URL that does not belong to the same Expo project', () => {
  assert.deepEqual(
    findReleaseEnvProblems({ ...ready, EXPO_PUBLIC_UPDATES_URL: 'https://example.com/updates' }),
    ['EXPO_PUBLIC_UPDATES_URL'],
  );
  assert.deepEqual(
    findReleaseEnvProblems({
      ...ready,
      EXPO_PUBLIC_UPDATES_URL: 'https://u.expo.dev/22222222-2222-2222-2222-222222222222',
    }),
    ['EXPO_PUBLIC_UPDATES_URL'],
  );
});

test('derives the updates URL from the project when it is omitted', () => {
  const { EXPO_PUBLIC_UPDATES_URL: _updatesUrl, ...withoutUpdatesUrl } = ready;
  assert.deepEqual(findReleaseEnvProblems(withoutUpdatesUrl), []);
});

test('rejects a relay URL that is not https', () => {
  assert.deepEqual(
    findReleaseEnvProblems({ ...ready, EXPO_PUBLIC_RELAY_URL: 'http://notifier-relay.example.workers.dev' }),
    ['EXPO_PUBLIC_RELAY_URL'],
  );
});
