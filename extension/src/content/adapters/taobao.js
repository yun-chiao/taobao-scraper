// 淘寶商品頁 Adapter
import {
  text,
  attrFrom,
  imgSources,
  parseJsonScripts,
  readGlobalState,
  queryParam,
  parsePrice,
  runStrategies,
} from './base.js';

const TITLE_SELECTORS = [
  'h1[class*="ItemTitle"]',
  'h1[class*="Title"]',
  '.tb-main-title',
  '.tb-detail-hd h1',
  'h1',
];

const THUMB_SELECTORS = [
  'ul[class*="thumbnails"] img',
  'div[class*="thumbnails"] img',
  '[class*="PicGallery"] img',
  '[class*="thumbnail"] img',
  '#J_UlThumb img',
  '.tb-thumb img',
];

const PRICE_SELECTORS = [
  '[class*="Price--priceText"]',
  '[class*="priceText"]',
  '#J_StrPrice .tb-rmb-num',
  '#J_StrPrice',
  '.tb-rmb-num',
  '.tm-price',
];

const ATTR_SELECTORS = [
  'ul[class*="attributes"] li',
  '#attributes li',
  '[class*="ItemAttr"] li',
  '.attributes-list li',
];

const SHOP_SELECTORS = [
  '[class*="ShopHeader"] [class*="name"]',
  '.tb-shop-name',
  '.slogo-shopname',
  '.shop-name',
];

export function stripTaobaoSuffix(title) {
  if (!title) return '';
  return title
    .replace(/\s*-\s*(淘宝网|tmall\.com天猫|天猫Tmall\.com|天猫国际|阿里药房).*$/i, '')
    .trim();
}

export function extractDomMeta(doc, extraTitleSelectors = []) {
  const rawTitle =
    text(doc, [...extraTitleSelectors, ...TITLE_SELECTORS]) ||
    attrFrom(doc, ['meta[property="og:title"]'], 'content') ||
    doc?.title ||
    '';
  const title = stripTaobaoSuffix(rawTitle);

  const priceStr = text(doc, PRICE_SELECTORS);
  const priceAmount = parsePrice(priceStr);
  const price = priceAmount != null ? { amount: priceAmount, currency: 'CNY' } : null;

  const attrs = {};
  for (const sel of ATTR_SELECTORS) {
    try {
      const nodes = doc?.querySelectorAll(sel) || [];
      if (nodes.length > 0) {
        nodes.forEach((li) => {
          const line = (li.innerText || li.textContent || '').trim();
          const parts = line.split(/[：:]/);
          if (parts.length >= 2) {
            const k = parts[0].trim();
            const v = parts.slice(1).join(':').trim();
            if (k && v) attrs[k] = v;
          }
        });
        if (Object.keys(attrs).length > 0) break;
      }
    } catch {
      // ignore
    }
  }

  const shopName = text(doc, SHOP_SELECTORS) || null;
  return { title, price, attrs, shopName };
}

export function walkStateForItem(obj, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 6) return null;
  let foundImages = null;
  let foundTitle = null;

  if (Array.isArray(obj.images) && obj.images.some((x) => typeof x === 'string')) {
    foundImages = obj.images.filter((x) => typeof x === 'string');
  } else if (Array.isArray(obj.picUrls) && obj.picUrls.some((x) => typeof x === 'string')) {
    foundImages = obj.picUrls.filter((x) => typeof x === 'string');
  }

  if (typeof obj.title === 'string' && obj.title.length > 3) {
    foundTitle = obj.title;
  } else if (typeof obj.itemTitle === 'string' && obj.itemTitle.length > 3) {
    foundTitle = obj.itemTitle;
  }

  if (foundImages && foundImages.length > 0) {
    return { rawImages: foundImages, title: foundTitle ? stripTaobaoSuffix(foundTitle) : undefined };
  }

  for (const key of Object.keys(obj)) {
    const child = obj[key];
    if (child && typeof child === 'object') {
      const sub = walkStateForItem(child, depth + 1);
      if (sub && sub.rawImages?.length) {
        if (!sub.title && foundTitle) sub.title = stripTaobaoSuffix(foundTitle);
        return sub;
      }
    }
  }
  return null;
}

export const adapter = {
  id: 'taobao',

  match(url) {
    if (!url) return false;
    try {
      const u = new URL(url);
      return /(^|\.)taobao\.com$/i.test(u.hostname) && (/\/item\.htm/i.test(u.pathname) || u.searchParams.has('id'));
    } catch {
      return false;
    }
  },

  extract(doc, location, win = undefined) {
    const url = location?.href || String(location || '');
    const itemId = queryParam(url, 'id');
    const domMeta = extractDomMeta(doc);

    return runStrategies(
      [
        {
          name: 'state',
          fn: () => {
            const state = readGlobalState(win, ['__INITIAL_DATA__', '__INIT_DATA__', '_DATA_Detail', 'g_config']);
            if (!state) return null;
            const walked = walkStateForItem(state);
            return walked ? { ...domMeta, ...walked } : null;
          },
        },
        {
          name: 'jsonld',
          fn: () => {
            const scripts = parseJsonScripts(doc, (txt) => txt.includes('"@type"') || txt.includes('images'));
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
        site: 'taobao',
        url,
        itemId,
        ...domMeta,
        extractor: { adapter: 'taobao' },
      },
    );
  },
};
