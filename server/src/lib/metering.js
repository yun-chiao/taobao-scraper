// 訂閱額度計量與滑動視窗限流（純模組，無外部 npm 依賴，支援注入 fake db 測試）。
// 免費方案 = 終身 10 件（累計所有月份）；Pro / Studio = 每月額度（UTC 月初重置）。
import { PLAN_LIMITS, PLAN_PERIOD } from '../shared/contract.js';
import { ApiError } from './errors.js';

export function periodStart(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export function periodEndMs(date = new Date()) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

/**
 * 查詢使用者額度與用量。免費方案回傳終身累計，付費方案回傳當月用量。
 * @param {{query: (sql:string, params?:any[]) => Promise<{rows:any[]}>}} db
 * @param {string} userId
 * @param {Date} [now]
 * @returns {Promise<import('../shared/contract.js').Usage>}
 */
export async function getUsage(db, userId, now = new Date()) {
  const pStart = periodStart(now);
  const pEnd = periodEndMs(now);

  const res = await db.query(
    `SELECT u.plan,
            COALESCE(p.monthly_limit, $3) AS limit,
            COALESCE(us.count, 0) AS used,
            COALESCE((SELECT SUM(count) FROM usage lu WHERE lu.user_id = u.id), 0) AS lifetime_used
     FROM users u
     LEFT JOIN plans p ON p.plan = u.plan
     LEFT JOIN usage us ON us.user_id = u.id AND us.period_start = $2
     WHERE u.id = $1`,
    [userId, pStart, PLAN_LIMITS.free],
  );

  const row = res.rows[0] || { plan: 'free', limit: PLAN_LIMITS.free, used: 0, lifetime_used: 0 };
  const plan = row.plan || 'free';
  const period = PLAN_PERIOD[plan] || 'monthly';
  const isLifetime = period === 'lifetime';
  return {
    plan,
    used: Number(isLifetime ? row.lifetime_used : row.used) || 0,
    limit: Number(row.limit) || PLAN_LIMITS[plan] || PLAN_LIMITS.free,
    period,
    periodEnd: isLifetime ? null : pEnd,
  };
}

/**
 * 原子化扣除 1 次額度。若已達上限則拋出 402 QUOTA_EXCEEDED。
 * 建議在 AI 生成成功後於 transaction 中呼叫，確保失敗不扣點。
 * 用量一律記在「當月」列：免費方案以所有月份加總判定，升級後自然切換為月計。
 */
export async function consume(db, userId, { upgradeUrl = 'https://listio.app/upgrade', now = new Date() } = {}) {
  const current = await getUsage(db, userId, now);
  if (current.used >= current.limit) {
    const isLifetime = current.period === 'lifetime';
    throw new ApiError(
      402,
      'QUOTA_EXCEEDED',
      isLifetime ? `免費 ${current.limit} 件已用完` : `本月額度已用完（${current.used}/${current.limit}）`,
      {
        extra: {
          upgradeUrl,
          usage: current,
          hint: isLifetime
            ? '升級 Pro 每月 150 件；或到設定改用自備 Gemini 金鑰，不限件數。'
            : '升級方案，或下個月再繼續。',
        },
      },
    );
  }

  const pStart = periodStart(now);
  const up = await db.query(
    `INSERT INTO usage (user_id, period_start, count)
     VALUES ($1, $2, 1)
     ON CONFLICT (user_id, period_start)
     DO UPDATE SET count = usage.count + 1
     RETURNING count`,
    [userId, pStart],
  );

  // 免費方案的 used 是跨月加總，不能直接用當月 RETURNING 值
  const monthCount = Number(up.rows[0]?.count);
  const used = current.period === 'lifetime' || !Number.isFinite(monthCount) ? current.used + 1 : monthCount;
  return {
    ...current,
    used,
  };
}

/**
 * 記憶體滑動視窗限流器（依 userId）。
 */
export function createRateLimiter({ perMinute = 20, now = () => Date.now() } = {}) {
  const buckets = new Map(); // key -> number[] timestamps

  return {
    check(key) {
      const t = now();
      const cutoff = t - 60000;
      const list = (buckets.get(key) || []).filter((ts) => ts > cutoff);
      if (list.length >= perMinute) {
        buckets.set(key, list);
        return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((list[0] + 60000 - t) / 1000)) };
      }
      list.push(t);
      buckets.set(key, list);
      return { allowed: true, remaining: perMinute - list.length };
    },
  };
}

export function rateLimit({ perMinute = 20 } = {}) {
  const limiter = createRateLimiter({ perMinute });
  return async (c, next) => {
    const user = c.get('user');
    const key = user?.id || c.req.header('x-forwarded-for') || 'anon';
    const res = limiter.check(key);
    if (!res.allowed) {
      throw new ApiError(429, 'RATE_LIMITED', '請求太頻繁，請稍候再試', {
        headers: { 'Retry-After': String(res.retryAfterSec) },
      });
    }
    await next();
  };
}
