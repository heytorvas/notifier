import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function missingEnv(names, env) {
  return names.filter((name) => {
    const value = env[name];
    return typeof value !== 'string' || value.trim() === '';
  });
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entry === fileURLToPath(import.meta.url)) {
  const missing = missingEnv(process.argv.slice(2), process.env);
  if (missing.length > 0) {
    console.error(`Missing required environment: ${missing.join(', ')}`);
    process.exit(1);
  }
}
