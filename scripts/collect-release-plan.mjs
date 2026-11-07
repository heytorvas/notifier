import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

import { createProjectHashAsync } from '@expo/fingerprint';

import { planRelease, selectComparison } from './release-plan.mjs';

const fingerprintOptions = {
  platforms: ['android'],
  ignorePaths: ['android/**', 'ios/**', '**/android/build/**'],
};

if (process.env.GITHUB_ACTIONS !== 'true') {
  console.error('collect-release-plan.mjs compares git history and only runs inside GitHub Actions.');
  process.exit(1);
}

const head = process.env.GITHUB_SHA;
const comparison = selectComparison({
  eventName: process.env.GITHUB_EVENT_NAME,
  before: process.env.BEFORE_SHA,
  base: process.env.BASE_SHA,
  head,
  isAncestor: (ancestor, descendant) => {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', ancestor, descendant], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  },
});

const plan = comparison
  ? planRelease({
      ...(await compare(comparison.base, head)),
      allowDeploy: comparison.allowDeploy,
    })
  : planRelease({ runAllTests: true });

writeOutputs(plan);

function writeOutputs(values) {
  const output = [
    `relay=${values.relay}`,
    `migrate=${values.migrate}`,
    `expo_build=${values.expoBuild}`,
    `expo_update=${values.expoUpdate}`,
    `native_tests=${values.nativeTests}`,
    '',
  ].join('\n');
  appendFileSync(process.env.GITHUB_OUTPUT, output);
}

async function compare(base, current) {
  const files = git(['diff', '--name-only', '--find-renames', base, current])
    .split('\n')
    .filter(Boolean);
  let currentHash;
  let baseHash;
  try {
    currentHash = await createProjectHashAsync(process.cwd(), fingerprintOptions);
    gitCheckout(base);
    baseHash = await createProjectHashAsync(process.cwd(), fingerprintOptions);
  } finally {
    gitCheckout(current);
  }
  return {
    files,
    fingerprintChanged: currentHash !== baseHash,
    runtimeChanged: runtime(base) !== runtime(current),
    dependenciesChanged: dependencies(base) !== dependencies(current),
  };
}

function runtime(ref) {
  const app = JSON.parse(git(['show', `${ref}:app.json`]));
  return `${app.expo.version}\n${app.expo.android.versionCode}`;
}

function dependencies(ref) {
  return JSON.stringify(JSON.parse(git(['show', `${ref}:package.json`])).dependencies ?? {});
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function gitCheckout(ref) {
  execFileSync('git', ['checkout', '--force', '--detach', ref], { stdio: ['ignore', 'ignore', 'inherit'] });
}
