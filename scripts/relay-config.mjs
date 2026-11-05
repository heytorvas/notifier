const PLACEHOLDER_PROJECT_ID = 'replace-with-your-firebase-project-id';

export function renderWranglerConfig(source, values) {
  const databaseId = values.CLOUDFLARE_D1_DATABASE_ID;
  const projectId = values.FIREBASE_PROJECT_ID;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(databaseId ?? '')) {
    throw new Error('Set CLOUDFLARE_D1_DATABASE_ID in relay/.env.');
  }
  if (!/^[a-z][a-z0-9-]{5,29}$/.test(projectId ?? '') || projectId === PLACEHOLDER_PROJECT_ID) {
    throw new Error('Set FIREBASE_PROJECT_ID in relay/.env.');
  }
  return replaceAssignment(replaceAssignment(source, 'database_id', databaseId), 'FIREBASE_PROJECT_ID', projectId);
}

function replaceAssignment(source, key, value) {
  const pattern = new RegExp(`^(${key}\\s*=\\s*")[^"]*(")`, 'm');
  if (!pattern.test(source)) throw new Error(`wrangler.toml is missing ${key}.`);
  return source.replace(pattern, `$1${value}$2`);
}
