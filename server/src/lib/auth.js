// Supabase JWT 驗證中介軟體（HS256）
import { jwtVerify } from 'jose';
import { config } from '../config.js';
import { unauthenticated } from './errors.js';
import { query } from './db.js';

const seenUsers = new Map(); // userId -> timestamp (5 分鐘快取避免每請求寫 DB)
const CACHE_TTL_MS = 5 * 60 * 1000;

export function requireAuth({ dbQuery = query, jwtSecret = config.supabaseJwtSecret } = {}) {
  const secretKey = new TextEncoder().encode(jwtSecret);

  return async (c, next) => {
    const authHeader = c.req.header('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) throw unauthenticated('缺少 Bearer Token');

    let payload;
    try {
      const verified = await jwtVerify(match[1].trim(), secretKey, { algorithms: ['HS256'] });
      payload = verified.payload;
    } catch {
      throw unauthenticated('登入憑證無效或已過期');
    }

    const userId = String(payload.sub || '');
    const email = String(payload.email || '');
    if (!userId) throw unauthenticated('Token 缺少使用者識別碼');

    const now = Date.now();
    if ((seenUsers.get(userId) || 0) + CACHE_TTL_MS < now && config.databaseUrl) {
      await dbQuery(
        `INSERT INTO users (id, email) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`,
        [userId, email],
      ).catch(() => {});
      seenUsers.set(userId, now);
    }

    c.set('user', { id: userId, email });
    await next();
  };
}
