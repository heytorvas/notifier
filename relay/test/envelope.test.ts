import { describe, expect, it } from 'vitest';

import { classifyFcmFailure, HttpError, validateEnvelope } from '../src/index';

describe('validateEnvelope', () => {
  const messageId = 'd9428888-122b-4e2d-8f48-0990c9f249e5';

  it('accepts a bounded version-one envelope', () => {
    expect(
      validateEnvelope({
        version: 1,
        messageId,
        nonce: '1234567890abcdef',
        ciphertext: 'cipher-text_1',
      }),
    ).toEqual({
      version: 1,
      messageId,
      nonce: '1234567890abcdef',
      ciphertext: 'cipher-text_1',
    });
  });

  it.each([
    { version: 2, messageId, nonce: '1234567890abcdef', ciphertext: 'ciphertext' },
    { version: 1, messageId: 'not-a-uuid', nonce: '1234567890abcdef', ciphertext: 'ciphertext' },
    { version: 1, messageId, nonce: '$invalid', ciphertext: 'ciphertext' },
    { version: 1, messageId, nonce: 'too-short', ciphertext: 'ciphertext' },
    { version: 1, messageId, nonce: '1234567890abcdef', ciphertext: 'a'.repeat(3_401) },
  ])('rejects malformed input', (input) => {
    expect(() => validateEnvelope(input)).toThrow(HttpError);
  });
});

describe('classifyFcmFailure', () => {
  it('marks invalid installations as terminal', () => {
    expect(classifyFcmFailure(404, '{"error":{"details":[{"errorCode":"UNREGISTERED"}]}}')).toBe(
      'unregistered',
    );
  });

  it.each([
    [429, 'throttled'],
    [500, 'unavailable'],
    [503, 'unavailable'],
    [400, 'rejected'],
    [401, 'rejected'],
  ] as const)('maps FCM status %s to %s', (status, expected) => {
    expect(classifyFcmFailure(status, '{}')).toBe(expected);
  });
});
