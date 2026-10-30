// 後端統一的錯誤模型。
// 回應格式固定為 CONTRACT §5：{ error: { code, message, ...extra } }。
// 這個檔案不得依賴 npm 套件（metering / prompts 等純模組會 import 它）。

import { ListioError } from '../shared/contract.js';

/** 契約錯誤碼 → HTTP 狀態。INVALID_REQUEST / RATE_LIMITED / NOT_FOUND / NOT_CONFIGURED 是後端專用碼（契約 §5 與補充）。 */
export const STATUS_BY_CODE = Object.freeze({
  UNAUTHENTICATED: 401,
  QUOTA_EXCEEDED: 402,
  NOT_FOUND: 404,
  INVALID_REQUEST: 422,
  RATE_LIMITED: 429,
  INTERNAL: 500,
  NOT_CONFIGURED: 501,
  MODEL_ERROR: 502,
  NETWORK: 502,
});

export class ApiError extends Error {
  /**
   * @param {number} status HTTP 狀態碼
   * @param {string} code 錯誤碼（見 STATUS_BY_CODE）
   * @param {string} message 給使用者看的繁體中文訊息
   * @param {{ extra?: Record<string, unknown>, headers?: Record<string, string>, cause?: unknown }} [opts]
   */
  constructor(status, code, message, opts = {}) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.extra = opts.extra ?? {};
    this.headers = opts.headers ?? {};
  }

  /** 契約格式的回應主體。 */
  toBody() {
    return { error: { code: this.code, message: this.message, ...this.extra } };
  }
}

export const unauthenticated = (message = '尚未登入或登入已過期') => new ApiError(401, 'UNAUTHENTICATED', message);
export const invalidRequest = (message) => new ApiError(422, 'INVALID_REQUEST', message);
export const notFound = (message = '找不到這個端點') => new ApiError(404, 'NOT_FOUND', message);
export const notConfigured = (message) => new ApiError(501, 'NOT_CONFIGURED', message);
export const internal = (message = '發生未預期的錯誤', cause) => new ApiError(500, 'INTERNAL', message, { cause });

/**
 * 把任何丟出來的東西轉成 ApiError：
 * - ApiError 原樣回傳；
 * - 帶有契約錯誤碼的物件（例如 shared/contract.js 的 ListioError）依 STATUS_BY_CODE 對應；
 * - 其餘一律 500 INTERNAL（訊息不外洩）。
 * @param {unknown} err
 * @returns {ApiError}
 */
export function toApiError(err) {
  if (err instanceof ApiError) return err;
  const code = err instanceof ListioError || (err && typeof err === 'object' && 'code' in err) ? String(err.code) : '';
  const status = STATUS_BY_CODE[code];
  if (status) {
    const message = typeof err.message === 'string' && err.message ? err.message : code;
    const extra = typeof err.hint === 'string' && err.hint ? { hint: err.hint } : {};
    return new ApiError(status, code, message, { extra, cause: err });
  }
  return internal(undefined, err);
}
