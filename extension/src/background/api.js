// Cloud 模式：呼叫 Listio 後端（見 CONTRACT §5 與 server/）。
import { ListioError } from '../shared/contract.js';

/**
 * @param {{backendUrl:string, authToken:string}} conn
 * @param {string} path
 * @param {RequestInit} init
 */
async function request(conn, path, init = {}) {
  if (!conn.authToken) throw new ListioError('UNAUTHENTICATED', '尚未登入 Listio');
  let res;
  try {
    res = await fetch(`${conn.backendUrl.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${conn.authToken}`,
        ...(init.headers || {}),
      },
    });
  } catch (err) {
    throw new ListioError('NETWORK', `連線 Listio 失敗：${err.message}`);
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data;
  const code = data?.error?.code || (res.status === 401 ? 'UNAUTHENTICATED' : res.status === 402 ? 'QUOTA_EXCEEDED' : 'INTERNAL');
  const err = new ListioError(code, data?.error?.message || `後端回應 ${res.status}`, data?.error?.hint);
  if (data?.error?.upgradeUrl) err.upgradeUrl = data.error.upgradeUrl;
  throw err;
}

/** @returns {Promise<{generated:any, usage:import('../shared/contract.js').Usage, model:string}>} */
export const generateViaBackend = (conn, body) => request(conn, '/v1/generate', { method: 'POST', body: JSON.stringify(body) });

/** @returns {Promise<import('../shared/contract.js').Usage>} */
export const fetchUsage = (conn) => request(conn, '/v1/usage');

export const fetchMe = (conn) => request(conn, '/v1/me');

export const postTelemetry = (conn, name, props) =>
  request(conn, '/v1/telemetry', { method: 'POST', body: JSON.stringify({ name, props }) }).catch(() => null);

export const createCheckout = (conn, plan, provider = 'stripe') =>
  request(conn, '/v1/billing/checkout', { method: 'POST', body: JSON.stringify({ plan, provider }) });

export const createPortal = (conn) => request(conn, '/v1/billing/portal', { method: 'POST', body: '{}' });

/**
 * 以裝置識別碼換取匿名 token（免費方案不需註冊）。此端點不需 Bearer，故不走 request()。
 * @param {string} backendUrl
 * @param {string} deviceId
 * @returns {Promise<{token:string, user:{id:string, anonymous:boolean}, usage:import('../shared/contract.js').Usage}>}
 */
export async function createAnonymousSession(backendUrl, deviceId) {
  let res;
  try {
    res = await fetch(`${backendUrl.replace(/\/$/, '')}/v1/auth/anonymous`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId }),
    });
  } catch (err) {
    throw new ListioError('NETWORK', `連線 Listio 失敗：${err.message}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.token) {
    throw new ListioError('UNAUTHENTICATED', data?.error?.message || `無法建立免費帳號（${res.status}）`, data?.error?.hint);
  }
  return data;
}
