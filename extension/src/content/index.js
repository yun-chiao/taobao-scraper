// Content script 入口：依網址路由至對應 adapter。
// 無頂層副作用，供 service worker 動態載入與執行。
import { ERROR_COPY } from '../shared/contract.js';
import { adapter as taobaoAdapter } from './adapters/taobao.js';
import { adapter as tmallAdapter } from './adapters/tmall.js';
import { adapter as alibaba1688Adapter } from './adapters/alibaba1688.js';

export const ADAPTERS = [taobaoAdapter, tmallAdapter, alibaba1688Adapter];

/**
 * 檢查網址是否支援。
 * @param {string} url
 * @returns {{supported: boolean, site: import('../shared/contract.js').Site|null}}
 */
export function probe(url) {
  if (!url) return { supported: false, site: null };
  for (const a of ADAPTERS) {
    if (a.match(url)) {
      return { supported: true, site: /** @type {any} */ (a.id) };
    }
  }
  return { supported: false, site: null };
}

/**
 * 在頁面中執行擷取，回傳 Product 或 `{ error: { code, message } }`。
 */
export function runExtract(doc = globalThis.document, location = globalThis.location, win = globalThis) {
  const url = location?.href || String(location || '');
  const adapter = ADAPTERS.find((a) => a.match(url));
  if (!adapter) {
    return {
      error: {
        code: 'UNSUPPORTED_PAGE',
        message: ERROR_COPY.UNSUPPORTED_PAGE.message,
      },
    };
  }

  const product = adapter.extract(doc, location, win);
  if (!product || !product.images || product.images.length === 0) {
    return {
      error: {
        code: 'EXTRACT_EMPTY',
        message: ERROR_COPY.EXTRACT_EMPTY.message,
      },
    };
  }

  return product;
}
