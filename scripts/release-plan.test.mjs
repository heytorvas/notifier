import assert from 'node:assert/strict';
import test from 'node:test';

import { fingerprintRequired, planRelease, runAllTestsFor, selectComparison } from './release-plan.mjs';

const ancestor = (base, head) => base === 'base' && head === 'head';

test('a fast-forward push can deploy against its previous tip', () => {
  assert.deepEqual(
    selectComparison({ eventName: 'push', before: 'base', head: 'head', isAncestor: ancestor }),
    { base: 'base', allowDeploy: true },
  );
});

test('a rewritten push cannot deploy', () => {
  assert.equal(
    selectComparison({
      eventName: 'push',
      before: 'other',
      head: 'head',
      isAncestor: () => false,
    }),
    null,
  );
});

test('a pull request is comparable and cannot deploy', () => {
  assert.deepEqual(
    selectComparison({
      eventName: 'pull_request',
      base: 'base',
      head: 'head',
      isAncestor: ancestor,
    }),
    { base: 'base', allowDeploy: false },
  );
});

test('documentation does not test native code or deploy', () => {
  assert.deepEqual(planRelease({ files: ['README.md', 'docs/SETUP_AND_BUILD.md'], allowDeploy: true }), {
    relay: false,
    migrate: false,
    expoBuild: false,
    expoUpdate: false,
    nativeTests: false,
  });
});

test('JavaScript publishes an update only when the native runtime is unchanged', () => {
  assert.deepEqual(planRelease({ files: ['src/ui/screens/DashboardScreen.tsx'], allowDeploy: true }), {
    relay: false,
    migrate: false,
    expoBuild: false,
    expoUpdate: true,
    nativeTests: false,
  });
});

test('a native fingerprint change builds a binary and does not publish an update', () => {
  const plan = planRelease({
    files: ['src/ui/screens/DashboardScreen.tsx', 'package.json'],
    fingerprintChanged: true,
    allowDeploy: true,
  });
  assert.equal(plan.expoBuild, true);
  assert.equal(plan.expoUpdate, false);
  assert.equal(plan.nativeTests, true);
});

test('Android module source requires a binary even if the fingerprint was not supplied', () => {
  const plan = planRelease({
    files: ['modules/notifier-native/android/src/main/java/expo/modules/notifiernative/notifications/MirrorPolicy.kt'],
    allowDeploy: true,
  });
  assert.equal(plan.expoBuild, true);
  assert.equal(plan.expoUpdate, false);
});

test('an app version change requires a binary because the runtime follows the app version', () => {
  const plan = planRelease({ files: ['app.json', 'src/app/index.tsx'], runtimeChanged: true, allowDeploy: true });
  assert.equal(plan.expoBuild, true);
  assert.equal(plan.expoUpdate, false);
  assert.equal(plan.nativeTests, true);
});

test('a native unit test does not publish a binary', () => {
  const plan = planRelease({
    files: ['modules/notifier-native/android/src/test/java/expo/modules/notifiernative/notifications/MirrorPolicyTest.kt'],
    allowDeploy: true,
  });
  assert.equal(plan.expoBuild, false);
  assert.equal(plan.expoUpdate, false);
  assert.equal(plan.nativeTests, true);
});

test('a production dependency change without a native fingerprint publishes an update', () => {
  assert.equal(
    planRelease({ files: ['package.json', 'package-lock.json'], dependenciesChanged: true, allowDeploy: true }).expoUpdate,
    true,
  );
});

test('a lockfile-only change does not publish', () => {
  const plan = planRelease({ files: ['package-lock.json'], allowDeploy: true });
  assert.equal(plan.expoUpdate, false);
  assert.equal(plan.expoBuild, false);
  assert.equal(plan.nativeTests, true);
});

test('relay source deploys without applying migrations', () => {
  const plan = planRelease({ files: ['relay/src/index.ts'], allowDeploy: true });
  assert.equal(plan.relay, true);
  assert.equal(plan.migrate, false);
});

test('a migration deploys the worker and applies migrations', () => {
  const plan = planRelease({ files: ['relay/migrations/0003_example.sql'], allowDeploy: true });
  assert.equal(plan.relay, true);
  assert.equal(plan.migrate, true);
});

test('relay tests do not deploy', () => {
  assert.equal(planRelease({ files: ['relay/test/pairing.integration.test.ts'], allowDeploy: true }).relay, false);
});

test('a pull request plans tests without deploys', () => {
  const plan = planRelease({
    files: ['src/app/index.tsx', 'relay/src/index.ts'],
    allowDeploy: false,
  });
  assert.equal(plan.expoUpdate, false);
  assert.equal(plan.relay, false);
  assert.equal(plan.nativeTests, false);
});

test('application and workflow files do not need a native fingerprint', () => {
  assert.equal(
    fingerprintRequired([
      'src/ui/screens/DashboardScreen.tsx',
      'relay/src/index.ts',
      'relay/vitest.config.ts',
      '.github/workflows/ci.yml',
      'docs/SETUP_AND_BUILD.md',
      'scripts/release-plan.mjs',
    ]),
    false,
  );
});

test('the Expo config helper needs a native fingerprint', () => {
  assert.equal(fingerprintRequired(['src/config/publicAppConfig.js']), true);
});

test('native unit tests do not need a native fingerprint', () => {
  assert.equal(
    fingerprintRequired([
      'modules/notifier-native/android/src/test/java/expo/modules/notifiernative/notifications/MirrorPolicyTest.kt',
    ]),
    false,
  );
});

test('app config, dependencies, assets, and native source need a native fingerprint', () => {
  for (const file of [
    'app.json',
    'app.config.ts',
    'package-lock.json',
    'assets/icon.png',
    'modules/notifier-native/android/src/main/java/expo/modules/notifiernative/notifications/MirrorPolicy.kt',
  ]) {
    assert.equal(fingerprintRequired([file]), true, file);
  }
});

test('a manual run does not force Android tests unless requested', () => {
  assert.equal(runAllTestsFor('workflow_dispatch'), false);
  assert.equal(runAllTestsFor('workflow_dispatch', true), true);
  assert.equal(runAllTestsFor('push'), true);
});

test('history that cannot be compared runs the full test set and deploys nothing', () => {
  const plan = planRelease({ runAllTests: true });
  assert.equal(plan.nativeTests, true);
  assert.equal(plan.expoBuild, false);
  assert.equal(plan.expoUpdate, false);
  assert.equal(plan.relay, false);
});
