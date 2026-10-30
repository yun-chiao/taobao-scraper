// Adapter 共用 DOM 輔助函式與流程執行器。純函式。
import { normalizeImages } from '../../shared/image-url.js';

/** @typedef {import('../../shared/contract.js').Product} Product */

export function text(doc, selectors) {
  if (!doc) return '';
  for (const s of selectors) {
    try {
      const el = doc.querySelector(s);
      if (el) {
        const val = (el.innerText || el.textContent || '').trim();
        if (val) return val;
      }
    } catch {
      // 容錯
    }
  }
  return '';
}

export function attrFrom(doc, selectors, attrName) {
  if (!doc) return null;
  for (const s of selectors) {
    try {
      const el = doc.querySelector(s);
      if (el) {
        const val = el.getAttribute(attrName);
        if (val) return val.trim();
      }
    } catch {
      // 容錯
    }
  }
  return null;
}

export function imgSources(doc, selectors) {
  if (!doc) return [];
  const urls = [];
  for (const s of selectors) {
    try {
      const nodes = doc.querySelectorAll(s);
      if (nodes && nodes.length > 0) {
        nodes.forEach((img) => {
          const src =
            img.src ||
            img.getAttribute('src') ||
            img.getAttribute('data-src') ||
            img.getAttribute('data-lazy-src') ||
            img.getAttribute('data-ks-lazyload');
          if (src) urls.push(src);
        });
        if (urls.length > 0) break;
      }
    } catch {
      // 容錯
    }
  }
  return urls;
}

export function parseJsonScripts(doc, predicate) {
  if (!doc) return [];
  const matches = [];
  try {
    const scripts = doc.querySelectorAll('script');
    for (const script of scripts) {
      const content = script.textContent || script.innerText || '';
      if (!content || !content.includes('{')) continue;
      if (predicate && !predicate(content)) continue;
      try {
        const data = JSON.parse(content);
        matches.push(data);
      } catch {
        // inline script 可能不是純 JSON，嘗試抓取大括號區塊
        const match = content.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            matches.push(JSON.parse(match[0]));
          } catch {
            // ignore
          }
        }
      }
    }
  } catch {
    // 容錯
  }
  return matches;
}

export function readGlobalState(win, names) {
  if (!win) return null;
  for (const name of names) {
    try {
      if (win[name] && typeof win[name] === 'object') return win[name];
    } catch {
      // 跨域或安全限制
    }
  }
  return null;
}

export function queryParam(location, name) {
  if (!location) return null;
  try {
    const url = new URL(location.href || location);
    return url.searchParams.get(name);
  } catch {
    const match = String(location).match(new RegExp('[?&]' + name + '=([^&#]*)'));
    return match ? decodeURIComponent(match[1]) : null;
  }
}

export function parsePrice(str) {
  if (!str) return null;
  const match = String(str).match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  return isNaN(num) ? null : num;
}

export function makeProduct(partial) {
  return {
    site: partial.site || 'taobao',
    url: partial.url || '',
    itemId: partial.itemId || null,
    title: partial.title || '',
    images: partial.images || [],
    price: partial.price || null,
    attrs: partial.attrs || {},
    skus: partial.skus || [],
    shopName: partial.shopName || null,
    extractor: {
      adapter: partial.extractor?.adapter || 'unknown',
      strategy: partial.extractor?.strategy || 'fallback',
      warnings: partial.extractor?.warnings || [],
    },
  };
}

/**
 * 依序嘗試多種策略（state -> jsonld -> dom -> fallback）。
 * 回傳第一個成功抓到圖片的策略結果。
 */
export function runStrategies(strategiesList, defaultPartial) {
  const accumulatedWarnings = [];
  let bestMeta = {};

  for (const { name, fn } of strategiesList) {
    try {
      const res = fn();
      if (res) {
        if (res.warnings) accumulatedWarnings.push(...res.warnings);
        // 保留已經抓到的文字欄位（如 title、price、attrs），即便該層沒抓到圖片
        for (const k of ['title', 'price', 'attrs', 'skus', 'shopName', 'itemId']) {
          if (res[k] && !bestMeta[k] && (typeof res[k] !== 'object' || Object.keys(res[k]).length > 0)) {
            bestMeta[k] = res[k];
          }
        }
        const images = normalizeImages(res.rawImages || [], { max: 9, filter: name === 'fallback' });
        if (images.length > 0) {
          return makeProduct({
            ...defaultPartial,
            ...bestMeta,
            ...res,
            title: res.title || bestMeta.title || defaultPartial.title || '',
            images,
            extractor: {
              adapter: defaultPartial.extractor?.adapter || 'unknown',
              strategy: name,
              warnings: accumulatedWarnings,
            },
          });
        }
      }
    } catch (err) {
      accumulatedWarnings.push(`${name} failed: ${err.message}`);
    }
  }

  return makeProduct({
    ...defaultPartial,
    ...bestMeta,
    images: [],
    extractor: {
      adapter: defaultPartial.extractor?.adapter || 'unknown',
      strategy: 'fallback',
      warnings: [...accumulatedWarnings, '無法找到商品圖片'],
    },
  });
}
