import test from 'node:test';
import assert from 'node:assert/strict';
import { periodStart, getUsage, consume, createRateLimiter } from '../server/src/lib/metering.js';

/**
 * 假 DB：以 rows 模擬 usage 表（period_start → count），免費方案看加總、付費方案看當月。
 */
function makeFakeDb({ plan = 'free', limit = 2, rows = {} } = {}) {
  const usage = { ...rows }; // period_start -> count
  return {
    usage,
    async query(sql, params = []) {
      if (sql.includes('SELECT u.plan')) {
        const pStart = params[1];
        const lifetime = Object.values(usage).reduce((a, b) => a + b, 0);
        return { rows: [{ plan, limit, used: usage[pStart] || 0, lifetime_used: lifetime }] };
      }
      if (sql.includes('INSERT INTO usage')) {
        const pStart = params[1];
        usage[pStart] = (usage[pStart] || 0) + 1;
        return { rows: [{ count: usage[pStart] }] };
      }
      return { rows: [] };
    },
  };
}

test('periodStart formats UTC month start', () => {
  assert.equal(periodStart(new Date('2026-10-29T10:00:00Z')), '2026-10-01');
});

test('free plan is lifetime: usage from previous months still counts and never resets', async () => {
  // 上個月已經用了 1 件
  const db = makeFakeDb({ plan: 'free', limit: 2, rows: { '2026-09-01': 1 } });
  const now = new Date('2026-10-15T00:00:00Z');

  const u0 = await getUsage(db, 'user_1', now);
  assert.equal(u0.period, 'lifetime');
  assert.equal(u0.periodEnd, null);
  assert.equal(u0.used, 1); // 跨月累計
  assert.equal(u0.limit, 2);

  const u1 = await consume(db, 'user_1', { now });
  assert.equal(u1.used, 2);

  await assert.rejects(
    () => consume(db, 'user_1', { now }),
    (err) => err.status === 402 && err.code === 'QUOTA_EXCEEDED' && /免費 2 件已用完/.test(err.message) && /自備/.test(err.extra.hint),
  );

  // 下個月也不會重置
  const nextMonth = await getUsage(db, 'user_1', new Date('2026-11-02T00:00:00Z'));
  assert.equal(nextMonth.used, 2);
});

test('paid plans are monthly: only the current month counts and periodEnd is set', async () => {
  const db = makeFakeDb({ plan: 'pro', limit: 3, rows: { '2026-09-01': 3 } });
  const now = new Date('2026-10-15T00:00:00Z');

  const u0 = await getUsage(db, 'user_2', now);
  assert.equal(u0.period, 'monthly');
  assert.equal(u0.used, 0); // 上個月的 3 件不算
  assert.equal(u0.periodEnd, Date.UTC(2026, 10, 1));

  const u1 = await consume(db, 'user_2', { now });
  assert.equal(u1.used, 1);
  await consume(db, 'user_2', { now });
  await consume(db, 'user_2', { now });
  await assert.rejects(
    () => consume(db, 'user_2', { now }),
    (err) => err.status === 402 && /本月額度已用完/.test(err.message),
  );
});

test('createRateLimiter sliding window blocks excess requests', () => {
  let t = 1000;
  const limiter = createRateLimiter({ perMinute: 2, now: () => t });
  assert.equal(limiter.check('u1').allowed, true);
  assert.equal(limiter.check('u1').allowed, true);
  assert.equal(limiter.check('u1').allowed, false);

  t += 61000;
  assert.equal(limiter.check('u1').allowed, true);
});
