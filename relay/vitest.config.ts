import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));

  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.toml' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            FIREBASE_CLIENT_EMAIL: 'test@example.invalid',
            FIREBASE_PRIVATE_KEY: 'not-used-by-non-delivery-tests',
          },
        },
      }),
    ],
    test: {
      setupFiles: ['./test/setup.ts'],
    },
  };
});
