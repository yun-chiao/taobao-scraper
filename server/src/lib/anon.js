// 匿名裝置帳號：免費方案（終身 10 件）不需註冊。
// 擴充功能在本機產生一組 deviceId（UUID v4），後端以 UUID v5 推導出穩定的 userId，
// 並核發與 Supabase 相同演算法（HS256）的 JWT，讓 requireAuth() 不需任何特例即可驗證。
import { createHash } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

/** Listio 匿名裝置命名空間（固定值，改了會讓既有免費帳號對不上）。 */
export const ANON_NAMESPACE = 'b7f1c2a4-3d5e-4f60-9a8b-1c2d3e4f5a6b';

/** 匿名 token 有效期：一年。到期後擴充功能會用同一個 deviceId 換新 token，userId 不變。 */
export const ANON_TOKEN_TTL_SECONDS = 365 * 24 * 3600;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidDeviceId(id) {
  return typeof id === 'string' && UUID_RE.test(id);
}

/**
 * 由 deviceId 推導 UUID v5（RFC 4122 §4.3），同一裝置永遠得到同一個 userId。
 * @param {string} deviceId
 */
export function anonymousUserId(deviceId) {
  const ns = Buffer.from(ANON_NAMESPACE.replace(/-/g, ''), 'hex');
  const digest = createHash('sha1')
    .update(Buffer.concat([ns, Buffer.from(String(deviceId).toLowerCase(), 'utf8')]))
    .digest();
  const b = Buffer.from(digest.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50; // version 5
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * 簽發匿名 JWT。payload 與 Supabase 相容（sub / email），另加 anon=true 供日後帳號綁定時辨識。
 * @param {{userId:string, secret:string, ttlSeconds?:number, now?:number}} p
 */
export async function signAnonymousToken({ userId, secret, ttlSeconds = ANON_TOKEN_TTL_SECONDS, now = Math.floor(Date.now() / 1000) }) {
  return new SignJWT({ email: '', anon: true, role: 'anon' })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(userId)
    .setIssuer('listio')
    .setIssuedAt(now)
    .setExpirationTime(now + ttlSeconds)
    .sign(new TextEncoder().encode(secret));
}

/** 驗證匿名 token（與 requireAuth 相同演算法），回傳 payload。 */
export async function verifyAnonymousToken(token, secret) {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] });
  return payload;
}
