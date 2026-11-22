export interface Env {
  DB: D1Database;
  CREATE_LIMITER: RateLimit;
  SEND_LIMITER: RateLimit;
  HEALTH_LIMITER: RateLimit;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  ANDROID_PACKAGE_NAME: string;
}

interface Inbox {
  id: string;
  owner_token_hash: string;
  pairing_token_hash: string | null;
  sender_token_hash: string | null;
  fid: string;
}

interface EncryptedEnvelope {
  version: number;
  messageId: string;
  nonce: string;
  ciphertext: string;
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};
const MAX_BODY_BYTES = 8_192;
const CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{32,512}$/;
const DUMMY_TOKEN_HASH = '00'.repeat(32);
const FID_PATTERN = /^[A-Za-z0-9_-]{20,128}$/;
const ENCODED_PATTERN = /^[A-Za-z0-9_-]+$/;
const MESSAGE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const SENDER_LISTENER_FRESH_MS = 3 * 60 * 60 * 1000;

let cachedAccessToken: { value: string; expiresAt: number } | undefined;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.message }, error.status, error.headers);
      }
      console.error('Unhandled relay error', error);
      return json({ error: 'Internal relay error.' }, 500);
    }
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    const oldestMessageTimestamp = Date.now() - 8 * 24 * 60 * 60 * 1_000;
    await env.DB.prepare('DELETE FROM delivered_messages WHERE delivered_at < ?')
      .bind(oldestMessageTimestamp)
      .run();
    const oldestActiveTimestamp = Date.now() - 90 * 24 * 60 * 60 * 1_000;
    await env.DB.prepare(
      'DELETE FROM inboxes WHERE sender_token_hash IS NULL AND updated_at < ?',
    )
      .bind(oldestActiveTimestamp)
      .run();
  },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/health') {
    return json({ status: 'ok' });
  }
  if (request.method === 'POST' && url.pathname === '/v1/inboxes') {
    const clientAddress = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const { success } = await env.CREATE_LIMITER.limit({ key: clientAddress });
    if (!success) throw new HttpError(429, 'Too many pairing attempts.');
    return createInbox(request, env);
  }

  const registrationMatch = url.pathname.match(
    /^\/v1\/inboxes\/([0-9a-f-]+)\/registration$/,
  );
  if (request.method === 'PUT' && registrationMatch?.[1]) {
    return updateRegistration(request, env, registrationMatch[1]);
  }

  const deviceMatch = url.pathname.match(/^\/v1\/inboxes\/([0-9a-f-]+)\/device$/);
  if (deviceMatch?.[1] && (request.method === 'GET' || request.method === 'PUT')) {
    return deviceProfile(request, env, deviceMatch[1]);
  }

  const listenerMatch = url.pathname.match(/^\/v1\/inboxes\/([0-9a-f-]+)\/listener$/);
  if (request.method === 'PUT' && listenerMatch?.[1]) {
    return updateListener(request, env, listenerMatch[1]);
  }

  const claimMatch = url.pathname.match(/^\/v1\/inboxes\/([0-9a-f-]+)\/claim$/);
  if (request.method === 'POST' && claimMatch?.[1]) {
    return claimInbox(request, env, claimMatch[1]);
  }

  const unpairMatch = url.pathname.match(/^\/v1\/inboxes\/([0-9a-f-]+)\/unpair$/);
  if (request.method === 'POST' && unpairMatch?.[1]) {
    return unpairInbox(request, env, unpairMatch[1]);
  }

  const messageMatch = url.pathname.match(/^\/v1\/inboxes\/([0-9a-f-]+)\/messages$/);
  if (request.method === 'POST' && messageMatch?.[1]) {
    return sendMessage(request, env, messageMatch[1]);
  }

  const inboxMatch = url.pathname.match(/^\/v1\/inboxes\/([0-9a-f-]+)$/);
  const statusMatch = url.pathname.match(/^\/v1\/inboxes\/([0-9a-f-]+)\/status$/);
  if (request.method === 'GET' && statusMatch?.[1]) {
    return pairingStatus(request, env, statusMatch[1]);
  }
  if (request.method === 'DELETE' && inboxMatch?.[1]) {
    return deleteInbox(request, env, inboxMatch[1]);
  }
  throw new HttpError(404, 'Not found.');
}

async function unpairInbox(request: Request, env: Env, inboxId: string): Promise<Response> {
  const inbox = await requireInbox(env, inboxId);
  await authorizeAny(request, [inbox.owner_token_hash, inbox.sender_token_hash]);
  await env.DB.prepare('DELETE FROM inboxes WHERE id = ?').bind(inboxId).run();
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

async function pairingStatus(request: Request, env: Env, inboxId: string): Promise<Response> {
  const inbox = await requireInbox(env, inboxId);
  await authorizeAny(request, [inbox.owner_token_hash, inbox.sender_token_hash]);
  const timing = await env.DB.prepare(
    'SELECT claimed_at, sender_listener_up, sender_listener_at FROM inboxes WHERE id = ?',
  )
    .bind(inboxId)
    .first<{
      claimed_at: number | null;
      sender_listener_up: number | null;
      sender_listener_at: number | null;
    }>();
  return json({
    claimed: inbox.sender_token_hash !== null,
    claimedAt: timing?.claimed_at ?? null,
    senderListener: describeSenderListener(
      timing?.sender_listener_up ?? null,
      timing?.sender_listener_at ?? null,
      Date.now(),
    ),
  });
}

async function updateListener(request: Request, env: Env, inboxId: string): Promise<Response> {
  const inbox = await requireInbox(env, inboxId);
  await authorize(request, inbox.sender_token_hash);
  const { success } = await env.HEALTH_LIMITER.limit({ key: inboxId });
  if (!success) throw new HttpError(429, 'Too many listener updates.');
  const body = await readJson(request);
  if (typeof body.listening !== 'boolean') throw new HttpError(400, 'Invalid listener state.');
  await env.DB.prepare(
    'UPDATE inboxes SET sender_listener_up = ?, sender_listener_at = ? WHERE id = ?',
  )
    .bind(body.listening ? 1 : 0, Date.now(), inboxId)
    .run();
  return json({ listening: body.listening });
}

async function createInbox(request: Request, env: Env): Promise<Response> {
  const body = await readJson(request);
  const fid = requireFid(body.fid);
  const id = crypto.randomUUID();
  const ownerToken = randomToken();
  const pairingToken = randomToken();
  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO inboxes
      (id, owner_token_hash, pairing_token_hash, sender_token_hash, fid, created_at, updated_at)
      VALUES (?, ?, ?, NULL, ?, ?, ?)`,
  )
    .bind(id, await hash(ownerToken), await hash(pairingToken), fid, now, now)
    .run();

  return json({ inboxId: id, ownerToken, pairingToken }, 201);
}

async function claimInbox(request: Request, env: Env, inboxId: string): Promise<Response> {
  const inbox = await requireInbox(env, inboxId);
  await authorize(request, inbox.pairing_token_hash);
  const senderToken = randomToken();
  const claimedAt = Date.now();
  const result = await env.DB.prepare(
    `UPDATE inboxes
     SET pairing_token_hash = NULL, sender_token_hash = ?, claimed_at = ?, updated_at = ?
     WHERE id = ? AND pairing_token_hash = ?`,
  )
    .bind(await hash(senderToken), claimedAt, claimedAt, inboxId, inbox.pairing_token_hash)
    .run();
  if (result.meta.changes !== 1) throw new HttpError(409, 'Pairing code was already claimed.');
  return json({ senderToken, claimedAt });
}

async function deviceProfile(request: Request, env: Env, inboxId: string): Promise<Response> {
  const inbox = await requireInbox(env, inboxId);
  if (request.method === 'PUT') {
    await authorize(request, inbox.owner_token_hash);
    const body = await readJson(request);
    const brand = deviceLabel(body.brand, 'brand');
    const model = deviceLabel(body.model, 'model');
    await env.DB.prepare(
      'UPDATE inboxes SET receiver_brand = ?, receiver_model = ? WHERE id = ?',
    )
      .bind(brand, model, inboxId)
      .run();
    return json({ updated: true });
  }

  await authorize(request, inbox.sender_token_hash);
  const device = await env.DB.prepare(
    'SELECT receiver_brand, receiver_model, claimed_at FROM inboxes WHERE id = ?',
  )
    .bind(inboxId)
    .first<{ receiver_brand: string; receiver_model: string; claimed_at: number | null }>();
  return json({
    brand: device?.receiver_brand ?? '',
    model: device?.receiver_model ?? '',
    pairedAt: device?.claimed_at ?? null,
  });
}

async function updateRegistration(
  request: Request,
  env: Env,
  inboxId: string,
): Promise<Response> {
  const inbox = await requireInbox(env, inboxId);
  await authorize(request, inbox.owner_token_hash);
  const body = await readJson(request);
  const fid = requireFid(body.fid);
  await env.DB.prepare('UPDATE inboxes SET fid = ?, updated_at = ? WHERE id = ?')
    .bind(fid, Date.now(), inboxId)
    .run();
  return json({ updated: true });
}

async function sendMessage(
  request: Request,
  env: Env,
  inboxId: string,
): Promise<Response> {
  const inbox = await requireInbox(env, inboxId);
  await authorize(request, inbox.sender_token_hash);
  const envelope = validateEnvelope(await readJson(request));
  const duplicate = await env.DB.prepare(
    'SELECT 1 AS found FROM delivered_messages WHERE inbox_id = ? AND message_id = ?',
  )
    .bind(inboxId, envelope.messageId)
    .first<{ found: number }>();
  if (duplicate) return json({ accepted: true, duplicate: true }, 202);
  const { success } = await env.SEND_LIMITER.limit({ key: inboxId });
  if (!success) throw new HttpError(429, 'Too many messages.');
  if (!inbox.fid) throw new HttpError(410, 'Receiver registration has expired.');
  const accessToken = await getAccessToken(env);
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/messages:send`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          fid: inbox.fid,
          data: {
            version: String(envelope.version),
            messageId: envelope.messageId,
            nonce: envelope.nonce,
            ciphertext: envelope.ciphertext,
          },
          android: {
            priority: 'HIGH',
            ttl: '604800s',
            restricted_package_name: env.ANDROID_PACKAGE_NAME,
          },
        },
      }),
    },
  );
  if (!response.ok) {
    const responseBody = await response.text();
    const failure = classifyFcmFailure(response.status, responseBody);
    if (failure === 'unregistered') {
      await env.DB.prepare('UPDATE inboxes SET fid = ?, updated_at = ? WHERE id = ?')
        .bind('', Date.now(), inboxId)
        .run();
      throw new HttpError(410, 'Receiver registration has expired.');
    }
    console.error('FCM rejected a message', response.status, failure);
    const retryAfter = response.headers.get('retry-after');
    if (failure === 'throttled') {
      throw new HttpError(429, 'Push provider is throttling delivery.', retryAfterHeader(retryAfter));
    }
    if (failure === 'unavailable') {
      throw new HttpError(503, 'Push provider is temporarily unavailable.', retryAfterHeader(retryAfter));
    }
    throw new HttpError(502, 'Push provider rejected the message.');
  }
  await env.DB.prepare('UPDATE inboxes SET updated_at = ? WHERE id = ?')
    .bind(Date.now(), inboxId)
    .run();
  await env.DB.prepare(
    'INSERT OR IGNORE INTO delivered_messages (inbox_id, message_id, delivered_at) VALUES (?, ?, ?)',
  )
    .bind(inboxId, envelope.messageId, Date.now())
    .run();
  return json({ accepted: true }, 202);
}

async function deleteInbox(
  request: Request,
  env: Env,
  inboxId: string,
): Promise<Response> {
  const inbox = await requireInbox(env, inboxId);
  await authorize(request, inbox.owner_token_hash);
  await env.DB.prepare('DELETE FROM inboxes WHERE id = ?').bind(inboxId).run();
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

async function requireInbox(env: Env, inboxId: string): Promise<Inbox> {
  const inbox = await env.DB.prepare(
    `SELECT id, owner_token_hash, sender_token_hash, fid
            , pairing_token_hash
     FROM inboxes WHERE id = ?`,
  )
    .bind(inboxId)
    .first<Inbox>();
  if (!inbox) throw new HttpError(404, 'Inbox not found.');
  return inbox;
}

async function authorize(request: Request, expectedHash: string | null): Promise<void> {
  await authorizeAny(request, [expectedHash]);
}

async function authorizeAny(request: Request, hashes: Array<string | null>): Promise<void> {
  if (!hashes.some((candidate) => candidate)) throw new HttpError(409, 'Capability is no longer active.');
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) throw new HttpError(401, 'Unauthorized.');
  const token = authorization.slice(7);
  if (!CAPABILITY_PATTERN.test(token)) throw new HttpError(401, 'Unauthorized.');
  const actual = hexToBytes(await hash(token));
  let matched = false;
  for (const candidate of hashes) {
    const expectedHex =
      typeof candidate === 'string' && /^[0-9a-f]{64}$/.test(candidate) ? candidate : DUMMY_TOKEN_HASH;
    if (fixedTimeEquals(actual, hexToBytes(expectedHex))) matched = true;
  }
  if (!matched) throw new HttpError(401, 'Unauthorized.');
}

function fixedTimeEquals(actual: Uint8Array, expected: Uint8Array): boolean {
  let mismatch = actual.length === expected.length ? 0 : 1;
  const length = Math.max(actual.length, expected.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (actual[index] ?? 0) ^ (expected[index] ?? 0);
  }
  return mismatch === 0;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function deviceLabel(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new HttpError(400, `Invalid ${name}.`);
  const cleaned = value.trim().replace(/[\u0000-\u001F\u007F]/g, '');
  if (cleaned.length > 40) throw new HttpError(400, `Invalid ${name}.`);
  return cleaned;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const declaredSize = Number(request.headers.get('content-length') ?? 0);
  if (declaredSize > MAX_BODY_BYTES) throw new HttpError(413, 'Request is too large.');
  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new HttpError(413, 'Request is too large.');
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  }
  try {
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'Invalid JSON body.');
  }
}

export function validateEnvelope(body: Record<string, unknown>): EncryptedEnvelope {
  if (body.version !== 1) throw new HttpError(400, 'Unsupported envelope version.');
  if (typeof body.messageId !== 'string' || !MESSAGE_ID_PATTERN.test(body.messageId)) {
    throw new HttpError(400, 'Invalid message ID.');
  }
  if (typeof body.nonce !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(body.nonce)) {
    throw new HttpError(400, 'Invalid nonce.');
  }
  if (
    typeof body.ciphertext !== 'string' ||
    !ENCODED_PATTERN.test(body.ciphertext) ||
    body.ciphertext.length > 3_400
  ) {
    throw new HttpError(400, 'Invalid ciphertext.');
  }
  return {
    version: 1,
    messageId: body.messageId,
    nonce: body.nonce,
    ciphertext: body.ciphertext,
  };
}

export function describeSenderListener(
  listening: number | null,
  reportedAt: number | null,
  now: number,
): 'up' | 'down' | 'unknown' {
  if (reportedAt == null || reportedAt <= 0) return 'unknown';
  if (now - reportedAt > SENDER_LISTENER_FRESH_MS) return 'down';
  return listening === 1 ? 'up' : 'down';
}

export function classifyFcmFailure(
  status: number,
  responseBody: string,
): 'unregistered' | 'throttled' | 'unavailable' | 'rejected' {
  if (runJson(responseBody, (value) => JSON.stringify(value).includes('UNREGISTERED'))) {
    return 'unregistered';
  }
  if (status === 429) return 'throttled';
  if (status >= 500) return 'unavailable';
  return 'rejected';
}

function runJson(text: string, predicate: (value: unknown) => boolean): boolean {
  try {
    return predicate(JSON.parse(text) as unknown);
  } catch {
    return false;
  }
}

function requireFid(value: unknown): string {
  if (typeof value !== 'string' || !FID_PATTERN.test(value)) {
    throw new HttpError(400, 'Invalid Firebase installation ID.');
  }
  return value;
}

async function getAccessToken(env: Env): Promise<string> {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const assertion = await createJwt(
    env.FIREBASE_CLIENT_EMAIL,
    env.FIREBASE_PRIVATE_KEY,
    nowSeconds,
  );
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) throw new HttpError(502, 'Could not authenticate with push provider.');
  const result = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!result.access_token) throw new HttpError(502, 'Push provider returned no access token.');
  cachedAccessToken = {
    value: result.access_token,
    expiresAt: Date.now() + (result.expires_in ?? 3_600) * 1_000,
  };
  return result.access_token;
}

async function createJwt(email: string, privateKey: string, now: number): Promise<string> {
  const header = encodeJson({ alg: 'RS256', typ: 'JWT' });
  const claims = encodeJson({
    iss: email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3_600,
  });
  const unsigned = `${header}.${claims}`;
  const keyBytes = pemToBytes(privateKey.replace(/\\n/g, '\n'));
  const keyBuffer = new ArrayBuffer(keyBytes.byteLength);
  new Uint8Array(keyBuffer).set(keyBytes);
  const key = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned),
  );
  return `${unsigned}.${base64Url(new Uint8Array(signature))}`;
}

function encodeJson(value: object): string {
  return base64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function pemToBytes(pem: string): Uint8Array {
  const base64 = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s/g, '');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
}

function randomToken(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function retryAfterHeader(value: string | null): HeadersInit {
  return value ? { 'retry-after': value } : {};
}

function json(body: object, status = 200, additionalHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...Object.fromEntries(new Headers(additionalHeaders)) },
  });
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly headers: HeadersInit = {},
  ) {
    super(message);
  }
}
