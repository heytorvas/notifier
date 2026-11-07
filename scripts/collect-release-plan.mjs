import { execFileSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';

import {
  FINGERPRINT_IGNORE_PATHS,
  fingerprintRequired,
  planRelease,
  runAllTestsFor,
  selectComparison,
} from './release-plan.mjs';

const fingerprintOptions = {
  platforms: ['android'],
  ignorePaths: FINGERPRINT_IGNORE_PATHS,
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

if (!comparison) {
  write({
    install: false,
    ...planRelease({
      runAllTests: runAllTestsFor(process.env.GITHUB_EVENT_NAME, process.env.NATIVE_TESTS === 'true'),
    }),
  });
} else {
  const files = changedFiles(comparison.base, head);
  if (process.env.PLAN_PHASE === 'scope' && fingerprintRequired(files)) {
    write({ install: true });
  } else if (!fingerprintRequired(files)) {
    write({ install: false, ...planRelease({ files, allowDeploy: comparison.allowDeploy }) });
  } else {
    write({
      install: true,
      ...planRelease({ ...(await compare(comparison.base, head, files)), allowDeploy: comparison.allowDeploy }),
    });
  }
}

function write(values) {
  const entries = [
    ['install', values.install],
    ['relay', values.relay],
    ['migrate', values.migrate],
    ['expo_build', values.expoBuild],
    ['expo_update', values.expoUpdate],
    ['native_tests', values.nativeTests],
  ];
  const output = entries
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  appendFileSync(process.env.GITHUB_OUTPUT, `${output}\n`);
}

function changedFiles(base, current) {
  return git(['diff', '--name-only', '--find-renames', base, current]).split('\n').filter(Boolean);
}

async function compare(base, current, files) {
  const { createProjectHashAsync } = await import('@expo/fingerprint');
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
