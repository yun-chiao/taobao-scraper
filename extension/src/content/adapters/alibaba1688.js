// 1688 商品頁 Adapter
import {
  text,
  attrFrom,
  imgSources,
  parseJsonScripts,
  readGlobalState,
  parsePrice,
  runStrategies,
} from './base.js';
import { walkStateForItem } from './taobao.js';

const TITLE_SELECTORS = ['h1.title-text', '.title-text', '.d-title', 'h1'];

const THUMB_SELECTORS = [
  '.detail-gallery-turn-wrapper img',
  '[class*="gallery"] img',
  '#dt-tab img',
  '.tab-content-container img',
  'ul.detail-gallery-turn img',
];

const PRICE_SELECTORS = ['.price-text', '[class*="price-text"]', '.price'];

function strip1688Suffix(title) {
  if (!title) return '';
  return title.replace(/\s*-\s*阿里巴巴.*$/i, '').trim();
}

export const adapter = {
  id: '1688',

  match(url) {
    if (!url) return false;
    try {
      const u = new URL(url);
      return /(^|\.)1688\.com$/i.test(u.hostname) && /\/offer\/\d+\.html/i.test(u.pathname);
    } catch {
      return false;
    }
  },

  extract(doc, location, win = undefined) {
    const url = location?.href || String(location || '');
    const idMatch = url.match(/\/offer\/(\d+)\.html/i);
    const itemId = idMatch ? idMatch[1] : null;

    const rawTitle =
      text(doc, TITLE_SELECTORS) ||
      attrFrom(doc, ['meta[property="og:title"]'], 'content') ||
      doc?.title ||
      '';
    const title = strip1688Suffix(rawTitle);

    const priceStr = text(doc, PRICE_SELECTORS);
    const priceAmount = parsePrice(priceStr);
    const price = priceAmount != null ? { amount: priceAmount, currency: 'CNY' } : null;

    const attrs = {};
    try {
      const items = doc?.querySelectorAll('.offer-attr-item') || [];
      items.forEach((item) => {
        const line = (item.innerText || item.textContent || '').trim();
        const parts = line.split(/[：:\n]/);
        if (parts.length >= 2) {
          const k = parts[0].trim();
          const v = parts.slice(1).join(' ').trim();
          if (k && v) attrs[k] = v;
        }
      });
    } catch {
      // ignore
    }

    const domMeta = { title, price, attrs, shopName: text(doc, ['.company-name', '.shop-name']) || null };

    return runStrategies(
      [
        {
          name: 'state',
          fn: () => {
            const state = readGlobalState(win, ['__INITIAL_DATA__', '__INIT_DATA__', 'iDetailData']);
            if (!state) return null;
            const walked = walkStateForItem(state);
            return walked ? { ...domMeta, ...walked } : null;
          },
        },
        {
          name: 'jsonld',
          fn: () => {
            const scripts = parseJsonScripts(doc, (txt) => txt.includes('images') || txt.includes('imageList'));
            for (const s of scripts) {
              const walked = walkStateForItem(s);
              if (walked) return { ...domMeta, ...walked };
            }
            return null;
          },
        },
        {
          name: 'dom',
          fn: () => {
            const rawImages = imgSources(doc, THUMB_SELECTORS);
            return { ...domMeta, rawImages };
          },
        },
        {
          name: 'fallback',
          fn: () => {
            const rawImages = imgSources(doc, ['img']);
            return { ...domMeta, rawImages };
          },
        },
      ],
      {
        site: '1688',
        url,
        itemId,
        ...domMeta,
        extractor: { adapter: '1688' },
      },
    );
  },
};
