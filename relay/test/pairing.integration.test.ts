import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import worker, { type Env } from '../src/index';

const ORIGIN = 'https://relay.example.test';
const FID = 'cdefghijklmnopqrstuvwx';
let nextClientAddress = 20;

describe('pairing API', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates an inbox and allows the pairing capability to be claimed only once', async () => {
    const created = await createInbox();
    expect(created.ownerToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(created.pairingToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const firstClaim = await dispatch(
      request(`/v1/inboxes/${created.inboxId}/claim`, {
        method: 'POST',
        token: created.pairingToken,
      }),
    );
    expect(firstClaim.status).toBe(200);
    const { senderToken } = await json<{ senderToken: string }>(firstClaim);
    expect(senderToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const secondClaim = await dispatch(
      request(`/v1/inboxes/${created.inboxId}/claim`, {
        method: 'POST',
        token: created.pairingToken,
      }),
    );
    expect(secondClaim.status).toBe(409);

    const status = await dispatch(
      request(`/v1/inboxes/${created.inboxId}/status`, { token: created.ownerToken }),
    );
    expect(status.status).toBe(200);
    const body = await json<{ claimed: boolean; claimedAt: number | null }>(status);
    expect(body.claimed).toBe(true);
    expect(typeof body.claimedAt).toBe('number');
  });

  it('rejects missing and incorrect capabilities', async () => {
    const created = await createInbox();
    const missing = await dispatch(
      request(`/v1/inboxes/${created.inboxId}/status`),
    );
    expect(missing.status).toBe(401);

    const incorrect = await dispatch(
      request(`/v1/inboxes/${created.inboxId}/status`, { token: 'x'.repeat(43) }),
    );
    expect(incorrect.status).toBe(401);
  });

  it('rejects malformed, oversized, and invalid inbox creation bodies', async () => {
    const malformed = await dispatch(
      new Request(`${ORIGIN}/v1/inboxes`, {
        method: 'POST',
        headers: {
          'cf-connecting-ip': '192.0.2.10',
          'content-type': 'application/json',
        },
        body: '{',
      }),
    );
    expect(malformed.status).toBe(400);

    const invalidFid = await dispatch(
      request('/v1/inboxes', {
        method: 'POST',
        body: { fid: 'not a firebase installation id' },
      }),
    );
    expect(invalidFid.status).toBe(400);

    const oversized = await dispatch(
      new Request(`${ORIGIN}/v1/inboxes`, {
        method: 'POST',
        headers: {
          'cf-connecting-ip': '192.0.2.11',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ fid: 'x'.repeat(9_000) }),
      }),
    );
    expect(oversized.status).toBe(413);
  });

  it('does not authorize owner capabilities to send messages', async () => {
    const created = await createInbox();
    await dispatch(
      request(`/v1/inboxes/${created.inboxId}/claim`, {
        method: 'POST',
        token: created.pairingToken,
      }),
    );
    const response = await dispatch(
      request(`/v1/inboxes/${created.inboxId}/messages`, {
        method: 'POST',
        token: created.ownerToken,
        body: {
          version: 1,
          messageId: 'd9428888-122b-4e2d-8f48-0990c9f249e5',
          nonce: '1234567890abcdef',
          ciphertext: 'encrypted_payload',
        },
      }),
    );

    expect(response.status).toBe(401);
  });

  it('deletes an inbox with its owner capability', async () => {
    const created = await createInbox();
    const deleted = await dispatch(
      request(`/v1/inboxes/${created.inboxId}`, {
        method: 'DELETE',
        token: created.ownerToken,
      }),
    );
    expect(deleted.status).toBe(204);

    const status = await dispatch(
      request(`/v1/inboxes/${created.inboxId}/status`, { token: created.ownerToken }),
    );
    expect(status.status).toBe(404);
  });

  it('forwards ciphertext once for repeated message IDs', async () => {
    const created = await createInbox();
    const claimed = await dispatch(
      request(`/v1/inboxes/${created.inboxId}/claim`, {
        method: 'POST',
        token: created.pairingToken,
      }),
    );
    const { senderToken } = await json<{ senderToken: string }>(claimed);
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'oauth-token', expires_in: 3_600 }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ name: 'message-id' }), { status: 200 }));
    const messageId = 'd9428888-122b-4e2d-8f48-0990c9f249e5';
    const sendRequest = () =>
      request(`/v1/inboxes/${created.inboxId}/messages`, {
        method: 'POST',
        token: senderToken,
        body: {
          version: 1,
          messageId,
          nonce: '1234567890abcdef',
          ciphertext: 'encrypted_payload',
        },
      });
    const testEnv: Env = {
      DB: env.DB,
      CREATE_LIMITER: env.CREATE_LIMITER,
      SEND_LIMITER: { async limit() { return { success: true }; } },
      FIREBASE_PROJECT_ID: env.FIREBASE_PROJECT_ID,
      FIREBASE_CLIENT_EMAIL: 'firebase@example.invalid',
      FIREBASE_PRIVATE_KEY: await createPrivateKey(),
      ANDROID_PACKAGE_NAME: env.ANDROID_PACKAGE_NAME,
    };

    const first = await worker.fetch(sendRequest(), testEnv);
    expect(first.status).toBe(202);
    const fcmRequest = fetchMock.mock.calls[1];
    expect(fcmRequest?.[0]).toContain('/messages:send');
    const fcmBody = JSON.parse(String((fcmRequest?.[1] as RequestInit).body)) as {
      message: { fid: string; data: Record<string, string> };
    };
    expect(fcmBody.message.fid).toBe(FID);
    expect(fcmBody.message.data.messageId).toBe(messageId);
    expect(fcmBody.message.data.ciphertext).toBe('encrypted_payload');

    const duplicate = await worker.fetch(sendRequest(), testEnv);
    expect(duplicate.status).toBe(202);
    await expect(json(duplicate)).resolves.toEqual({ accepted: true, duplicate: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const columns = await env.DB.prepare('PRAGMA table_info(delivered_messages)').all<{
      name: string;
    }>();
    expect(columns.results.map(({ name }) => name)).toEqual([
      'inbox_id',
      'message_id',
      'delivered_at',
    ]);
  });

  it('cleans dedupe records and abandoned codes without expiring paired inboxes', async () => {
    const abandoned = await createInbox();
    const paired = await createInbox();
    await dispatch(
      request(`/v1/inboxes/${paired.inboxId}/claim`, {
        method: 'POST',
        token: paired.pairingToken,
      }),
    );
    const oldInboxTimestamp = Date.now() - 91 * 24 * 60 * 60 * 1_000;
    const oldMessageTimestamp = Date.now() - 9 * 24 * 60 * 60 * 1_000;
    await env.DB.prepare('UPDATE inboxes SET updated_at = ? WHERE id IN (?, ?)')
      .bind(oldInboxTimestamp, abandoned.inboxId, paired.inboxId)
      .run();
    await env.DB.prepare(
      'INSERT INTO delivered_messages (inbox_id, message_id, delivered_at) VALUES (?, ?, ?)',
    )
      .bind(paired.inboxId, 'd9428888-122b-4e2d-8f48-0990c9f249e5', oldMessageTimestamp)
      .run();

    await worker.scheduled?.({} as ScheduledController, env as Env);

    expect(
      await env.DB.prepare('SELECT id FROM inboxes WHERE id = ?')
        .bind(abandoned.inboxId)
        .first(),
    ).toBeNull();
    expect(
      await env.DB.prepare('SELECT id FROM inboxes WHERE id = ?')
        .bind(paired.inboxId)
        .first(),
    ).not.toBeNull();
    expect(
      await env.DB.prepare('SELECT message_id FROM delivered_messages WHERE inbox_id = ?')
        .bind(paired.inboxId)
        .first(),
    ).toBeNull();
  });

  it('publishes the receiver device only to the paired sender', async () => {
    const created = await createInbox();
    const published = await dispatch(
      request(`/v1/inboxes/${created.inboxId}/device`, {
        method: 'PUT',
        token: created.ownerToken,
        body: { brand: 'Google', model: 'Pixel Tablet' },
      }),
    );
    expect(published.status).toBe(200);

    const beforeClaim = await dispatch(
      request(`/v1/inboxes/${created.inboxId}/device`, { token: created.pairingToken }),
    );
    expect(beforeClaim.status).toBe(409);

    const claimed = await dispatch(
      request(`/v1/inboxes/${created.inboxId}/claim`, {
        method: 'POST',
        token: created.pairingToken,
      }),
    );
    const { senderToken } = await json<{ senderToken: string }>(claimed);
    const device = await dispatch(
      request(`/v1/inboxes/${created.inboxId}/device`, { token: senderToken }),
    );
    const body = await json<{ brand: string; model: string; pairedAt: number | null }>(device);
    expect(body.brand).toBe('Google');
    expect(body.model).toBe('Pixel Tablet');
    expect(typeof body.pairedAt).toBe('number');
    const ownerDenied = await dispatch(
      request(`/v1/inboxes/${created.inboxId}/device`, { token: created.ownerToken }),
    );
    expect(ownerDenied.status).toBe(401);

    const oversized = await dispatch(
      request(`/v1/inboxes/${created.inboxId}/device`, {
        method: 'PUT',
        token: created.ownerToken,
        body: { brand: 'x'.repeat(41), model: 'Pixel' },
      }),
    );
    expect(oversized.status).toBe(400);
  });

  it('rejects a sender that exceeds the message rate limit', async () => {
    const created = await createInbox();
    const claimed = await dispatch(
      request(`/v1/inboxes/${created.inboxId}/claim`, {
        method: 'POST',
        token: created.pairingToken,
      }),
    );
    const { senderToken } = await json<{ senderToken: string }>(claimed);
    const limited: Env = {
      ...(env as Env),
      SEND_LIMITER: { async limit() { return { success: false }; } },
    };
    const response = await worker.fetch(
      request(`/v1/inboxes/${created.inboxId}/messages`, {
        method: 'POST',
        token: senderToken,
        body: {
          version: 1,
          messageId: 'd9428888-122b-4e2d-8f48-0990c9f249e6',
          nonce: '1234567890abcdef',
          ciphertext: 'ciphertext',
        },
      }),
      limited,
    );
    expect(response.status).toBe(429);
  });
});

async function createInbox(): Promise<{
  inboxId: string;
  ownerToken: string;
  pairingToken: string;
}> {
  const response = await dispatch(
    request('/v1/inboxes', {
      method: 'POST',
      body: { fid: FID },
      clientAddress: `192.0.2.${nextClientAddress++}`,
    }),
  );
  expect(response.status).toBe(201);
  return json(response);
}

function request(
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: object;
    clientAddress?: string;
  } = {},
): Request {
  const headers = new Headers({
    'cf-connecting-ip': options.clientAddress ?? '192.0.2.1',
  });
  if (options.token) headers.set('authorization', `Bearer ${options.token}`);
  if (options.body) headers.set('content-type', 'application/json');
  return new Request(`${ORIGIN}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

async function json<T = unknown>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

function dispatch(request: Request): Promise<Response> {
  return worker.fetch(request, env as Env);
}

async function createPrivateKey(): Promise<string> {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2_048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const bytes = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const lines = btoa(binary).match(/.{1,64}/g)?.join('\n') ?? '';
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
}
