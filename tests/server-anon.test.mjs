import test from 'node:test';
import assert from 'node:assert/strict';
import {
  anonymousUserId,
  isValidDeviceId,
  signAnonymousToken,
  verifyAnonymousToken,
} from '../server/src/lib/anon.js';

const SECRET = 'test-secret-at-least-32-characters-long!!';

test('anonymousUserId is a deterministic RFC 4122 v5 UUID (same device → same user)', () => {
  const deviceId = '6f1d2c3b-4a5e-4f60-8b9c-0d1e2f3a4b5c';
  const a = anonymousUserId(deviceId);
  const b = anonymousUserId(deviceId.toUpperCase());
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, anonymousUserId('7f1d2c3b-4a5e-4f60-8b9c-0d1e2f3a4b5c'));
});

test('isValidDeviceId only accepts UUIDs', () => {
  assert.equal(isValidDeviceId('6f1d2c3b-4a5e-4f60-8b9c-0d1e2f3a4b5c'), true);
  assert.equal(isValidDeviceId('not-a-uuid'), false);
  assert.equal(isValidDeviceId(''), false);
  assert.equal(isValidDeviceId(null), false);
});

test('signAnonymousToken issues an HS256 JWT that requireAuth-style verification accepts', async () => {
  const userId = anonymousUserId('6f1d2c3b-4a5e-4f60-8b9c-0d1e2f3a4b5c');
  const token = await signAnonymousToken({ userId, secret: SECRET, now: 1_800_000_000 });
  const payload = await verifyAnonymousToken(token, SECRET);
  assert.equal(payload.sub, userId);
  assert.equal(payload.anon, true);
  assert.equal(payload.email, '');
  assert.equal(payload.exp - payload.iat, 365 * 24 * 3600);
  await assert.rejects(() => verifyAnonymousToken(token, 'wrong-secret-wrong-secret-wrong-secret!'));
});
