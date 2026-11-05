import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderWranglerConfig } from '../../scripts/relay-config.mjs';

const relayRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = parseEnv(path.join(relayRoot, '.env'));
const rendered = renderWranglerConfig(readFileSync(path.join(relayRoot, 'wrangler.toml'), 'utf8'), env);
const configPath = path.join(relayRoot, '.wrangler.local.toml');
writeFileSync(configPath, rendered);

const result = spawnSync(
  path.join(relayRoot, 'node_modules', '.bin', 'wrangler'),
  ['--config', configPath, ...process.argv.slice(2)],
  { cwd: relayRoot, stdio: 'inherit' },
);
process.exit(result.status ?? 1);

function parseEnv(filePath) {
  const values = {};
  const text = readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (match) values[match[1]] = match[2];
  }
  return values;
}
