// POST /v1/auth/anonymous：以裝置識別碼換取匿名 token（免費方案不需註冊）。
import { Hono } from 'hono';
import { newUsage } from '../shared/contract.js';
import { config } from '../config.js';
import { invalidRequest } from '../lib/errors.js';
import { getPool, query } from '../lib/db.js';
import { getUsage, rateLimit } from '../lib/metering.js';
import { anonymousUserId, isValidDeviceId, signAnonymousToken } from '../lib/anon.js';

export const authRoutes = new Hono();

// 未登入端點以來源 IP 限流（rateLimit 在沒有 user 時會改用 x-forwarded-for）
authRoutes.post('/anonymous', rateLimit({ perMinute: 10 }), async (c) => {
  const body = await c.req.json().catch(() => null);
  const deviceId = body?.deviceId;
  if (!isValidDeviceId(deviceId)) throw invalidRequest('deviceId 必須為 UUID 格式');

  const userId = anonymousUserId(deviceId);

  let usage = newUsage();
  if (config.databaseUrl) {
    await query(
      `INSERT INTO users (id, email, is_anonymous, device_id)
       VALUES ($1, '', TRUE, $2)
       ON CONFLICT (id) DO NOTHING`,
      [userId, deviceId],
    );
    usage = await getUsage(getPool(), userId);
  }

  const token = await signAnonymousToken({ userId, secret: config.supabaseJwtSecret });
  return c.json({ token, user: { id: userId, anonymous: true }, usage });
});
