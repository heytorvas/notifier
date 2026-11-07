import assert from 'node:assert/strict';
import test from 'node:test';

import { missingEnv } from './require-env.mjs';

test('names every empty release variable', () => {
  assert.deepEqual(missingEnv(['EXPO_TOKEN', 'EAS_PROJECT_ID'], { EXPO_TOKEN: 'present', EAS_PROJECT_ID: '  ' }), [
    'EAS_PROJECT_ID',
  ]);
});

test('accepts a complete environment', () => {
  assert.deepEqual(missingEnv(['EXPO_TOKEN'], { EXPO_TOKEN: 'present' }), []);
});
