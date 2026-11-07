const JAVASCRIPT_PREFIXES = ['src/', 'assets/', 'modules/notifier-native/src/'];
const JAVASCRIPT_FILES = new Set(['app.json', 'app.config.ts']);

const NATIVE_SOURCE_PREFIXES = [
  'modules/notifier-native/android/src/main/',
  'modules/notifier-native/android/src/debug/',
  'modules/notifier-native/android/src/release/',
];
const NATIVE_SOURCE_FILES = new Set([
  'modules/notifier-native/expo-module.config.json',
  'modules/notifier-native/android/build.gradle',
  'modules/notifier-native/android/consumer-rules.pro',
]);

const NATIVE_TEST_FILES = new Set(['app.json', 'app.config.ts', 'package.json', 'package-lock.json']);

const RELAY_FILES = new Set([
  'relay/wrangler.toml',
  'relay/package.json',
  'relay/package-lock.json',
  'relay/scripts/deploy.mjs',
  'scripts/relay-config.mjs',
]);

const FINGERPRINT_FREE_PREFIXES = [
  'src/',
  'relay/',
  '.github/',
  'docs/',
  'scripts/',
  'modules/notifier-native/android/src/test/',
];
const FINGERPRINT_FREE_FILES = new Set(['README.md', 'LICENSE', 'AGENTS.md', 'eslint.config.js', '.npmrc']);
const FINGERPRINT_SOURCE_FILES = new Set(['src/config/publicAppConfig.js']);

export const FINGERPRINT_IGNORE_PATHS = [
  'android/**',
  'ios/**',
  '**/android/build/**',
  'modules/notifier-native/android/src/test/**',
];

export function fingerprintRequired(files = []) {
  return files.some((file) => !isFingerprintFree(file));
}

export function runAllTestsFor(eventName, nativeTestsRequested = false) {
  return eventName !== 'workflow_dispatch' || nativeTestsRequested;
}

export function selectComparison({ eventName, before, base, head, isAncestor }) {
  if (!head || typeof isAncestor !== 'function') return null;
  if (eventName === 'pull_request') {
    return base && isAncestor(base, head) ? { base, allowDeploy: false } : null;
  }
  if (eventName !== 'push' || !before || /^0+$/.test(before) || !isAncestor(before, head)) return null;
  return { base: before, allowDeploy: true };
}

export function planRelease({
  files = [],
  fingerprintChanged = false,
  runtimeChanged = false,
  dependenciesChanged = false,
  allowDeploy = false,
  runAllTests = false,
} = {}) {
  const nativeBuild = fingerprintChanged || runtimeChanged || files.some(isNativeSource);
  const javascript = dependenciesChanged || files.some(isJavascript);
  const relay = files.some(isRelayDeploy);
  return {
    relay: allowDeploy && relay,
    migrate: allowDeploy && files.some((file) => file.startsWith('relay/migrations/')),
    expoBuild: allowDeploy && nativeBuild,
    expoUpdate: allowDeploy && javascript && !nativeBuild,
    nativeTests: runAllTests || nativeBuild || files.some(isNativeTest),
  };
}

function isFingerprintFree(file) {
  if (FINGERPRINT_SOURCE_FILES.has(file)) return false;
  return FINGERPRINT_FREE_FILES.has(file) || FINGERPRINT_FREE_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function isJavascript(file) {
  return JAVASCRIPT_FILES.has(file) || JAVASCRIPT_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function isNativeSource(file) {
  return NATIVE_SOURCE_FILES.has(file) || NATIVE_SOURCE_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function isNativeTest(file) {
  return (
    NATIVE_TEST_FILES.has(file) ||
    file.startsWith('modules/notifier-native/android/') ||
    file.startsWith('modules/notifier-native/src/')
  );
}

function isRelayDeploy(file) {
  if (file.startsWith('relay/test/')) return false;
  return (
    RELAY_FILES.has(file) ||
    file.startsWith('relay/src/') ||
    file.startsWith('relay/migrations/')
  );
}
