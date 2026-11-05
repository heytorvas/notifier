import assert from 'node:assert/strict';
import test from 'node:test';

import { renderWranglerConfig } from './relay-config.mjs';

const values = {
  CLOUDFLARE_D1_DATABASE_ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  FIREBASE_PROJECT_ID: 'notifier-personal',
};

const source = `database_id = "replace-with-your-d1-database-id"
FIREBASE_PROJECT_ID = "replace-with-your-firebase-project-id"
`;

test('render replaces the database and project assignments', () => {
  const rendered = renderWranglerConfig(source, values);
  assert.match(rendered, /database_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"/);
  assert.match(rendered, /FIREBASE_PROJECT_ID = "notifier-personal"/);
});

test('render refuses a toml that has no assignment to replace', () => {
  assert.throws(() => renderWranglerConfig('name = "notifier-relay"\n', values), /missing database_id/);
});
