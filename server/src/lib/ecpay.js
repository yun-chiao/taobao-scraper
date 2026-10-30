// 綠界 ECPay CheckMacValue 簽章計算與驗證（純 node:crypto，無外部依賴）。
// 演算法：
// 1. 將參數（排除 CheckMacValue 本身）依 key 不分大小寫字母序排序
// 2. 前後串接 HashKey=...&...&HashIV=...
// 3. URL encode 後轉小寫，並依綠界規範還原特定字元 (%20 -> +, %2d -> -, %5f -> _, %2e -> ., %21 -> !, %2a -> *, %28 -> (, %29 -> ))
// 4. 以 SHA-256 雜湊並轉大寫十六進位字串
import { createHash } from 'node:crypto';

export function ecpayUrlEncode(str) {
  return encodeURIComponent(str)
    .toLowerCase()
    .replace(/%20/g, '+')
    .replace(/%2d/g, '-')
    .replace(/%5f/g, '_')
    .replace(/%2e/g, '.')
    .replace(/%21/g, '!')
    .replace(/%2a/g, '*')
    .replace(/%28/g, '(')
    .replace(/%29/g, ')');
}

/**
 * 計算綠界 CheckMacValue（SHA256）。
 * @param {Record<string, string|number>} params
 * @param {string} hashKey
 * @param {string} hashIv
 * @returns {string}
 */
export function checkMacValue(params, hashKey, hashIv) {
  const keys = Object.keys(params || {})
    .filter((k) => k.toLowerCase() !== 'checkmacvalue')
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  const pairs = keys.map((k) => `${k}=${params[k] ?? ''}`);
  const raw = `HashKey=${hashKey}&${pairs.join('&')}&HashIV=${hashIv}`;
  const encoded = ecpayUrlEncode(raw);
  return createHash('sha256').update(encoded, 'utf8').digest('hex').toUpperCase();
}

export function verifyMacValue(params, hashKey, hashIv) {
  const given = String(params?.CheckMacValue || params?.checkmacvalue || '').toUpperCase();
  if (!given) return false;
  return checkMacValue(params, hashKey, hashIv) === given;
}
