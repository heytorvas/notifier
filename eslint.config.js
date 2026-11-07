const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  {
    ignores: [
      'android/**',
      'dist/**',
      'dist-check/**',
      'node_modules/**',
      'relay/**',
      'scripts/**',
      '.tools/**',
      'modules/notifier-native/android/build/**',
    ],
  },
  expoConfig,
  {
    rules: {
      'no-console': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: "TSAsExpression[typeAnnotation.type='TSAnyKeyword']",
          message: 'Do not bypass type safety with any.',
        },
      ],
    },
  },
]);
