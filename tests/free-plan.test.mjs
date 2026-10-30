import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryBackend, KEYS, SCHEMA_VERSION } from '../extension/src/shared/storage.js';
import { newUsage, quotaRemaining, PLAN_LIMITS } from '../extension/src/shared/contract.js';
import { defaultSettings } from '../extension/src/shared/brands.js';
import { describeQuota } from '../extension/src/sidepanel/views/home.js';

test('default settings use the cloud free plan (no API key required) and usage is lifetime', async () => {
  assert.equal(defaultSettings().mode, 'cloud');
  const store = createStore(memoryBackend());
  await store.init();
  const u = await store.getUsage();
  assert.deepEqual(u, { plan: 'free', used: 0, limit: PLAN_LIMITS.free, period: 'lifetime', periodEnd: null });
});

test('lifetime usage does not reset when the stored periodEnd is in the past', async () => {
  const backend = memoryBackend({
    [KEYS.SCHEMA]: SCHEMA_VERSION,
    [KEYS.USAGE]: { plan: 'free', used: 7, limit: 10, period: 'lifetime', periodEnd: null },
  });
  const store = createStore(backend);
  await store.init();
  const u = await store.getUsage();
  assert.equal(u.used, 7);
  assert.equal(quotaRemaining(u), 3);
  const bumped = await store.bumpUsage();
  assert.equal(bumped.used, 8);
});

test('migration v2 → v3 moves key-less BYOK users to cloud and normalizes legacy monthly usage', async () => {
  const backend = memoryBackend({
    [KEYS.SCHEMA]: 2,
    [KEYS.SETTINGS]: { ...defaultSettings(), mode: 'byok', geminiApiKey: '' },
    [KEYS.USAGE]: { plan: 'free', used: 4, limit: 10, periodEnd: Date.now() - 1000 },
  });
  const store = createStore(backend);
  await store.init();
  const s = await store.getSettings();
  assert.equal(s.mode, 'cloud');
  const u = await store.getUsage();
  assert.equal(u.period, 'lifetime');
  assert.equal(u.used, 4);
  assert.equal(u.periodEnd, null);

  // 已填金鑰的 BYOK 使用者不受影響
  const backend2 = memoryBackend({
    [KEYS.SCHEMA]: 2,
    [KEYS.SETTINGS]: { ...defaultSettings(), mode: 'byok', geminiApiKey: 'AIzaReal' },
  });
  const store2 = createStore(backend2);
  await store2.init();
  assert.equal((await store2.getSettings()).mode, 'byok');
});

test('describeQuota wording: lifetime free, low, exhausted, monthly paid, byok', () => {
  const cloud = { mode: 'cloud' };
  assert.deepEqual(describeQuota(cloud, newUsage({ used: 3 })), {
    text: '免費額度還可產生 7 件',
    tone: 'muted',
    exhausted: false,
  });
  assert.equal(describeQuota(cloud, newUsage({ used: 8 })).tone, 'warn');
  const out = describeQuota(cloud, newUsage({ used: 10 }));
  assert.equal(out.exhausted, true);
  assert.match(out.text, /免費 10 件已用完/);

  const pro = describeQuota(cloud, newUsage({ plan: 'pro', used: 20, periodEnd: Date.UTC(2026, 10, 1) }));
  assert.match(pro.text, /本月還可產生 130 件/);
  assert.equal(pro.exhausted, false);

  assert.equal(describeQuota({ mode: 'byok' }, newUsage({ used: 99 })).text, '自備 Gemini 金鑰 · 不限件數');
});
