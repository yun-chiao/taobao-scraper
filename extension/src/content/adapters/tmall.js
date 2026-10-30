// 天貓商品頁 Adapter
import { imgSources, parseJsonScripts, readGlobalState, queryParam, runStrategies } from './base.js';
import { extractDomMeta, walkStateForItem } from './taobao.js';

const TMALL_THUMB_SELECTORS = [
  'ul[class*="thumbnails"] img',
  'div[class*="thumbnails"] img',
  '[class*="PicGallery"] img',
  '#J_UlThumb img',
  '.tb-thumb img',
];

export const adapter = {
  id: 'tmall',

  match(url) {
    if (!url) return false;
    try {
      const u = new URL(url);
      return /(^|\.)tmall\.(com|hk)$/i.test(u.hostname) && (/\/item\.htm/i.test(u.pathname) || u.searchParams.has('id'));
    } catch {
      return false;
    }
  },

  extract(doc, location, win = undefined) {
    const url = location?.href || String(location || '');
    const itemId = queryParam(url, 'id');
    const domMeta = extractDomMeta(doc, ['.tb-detail-hd h1']);

    return runStrategies(
      [
        {
          name: 'state',
          fn: () => {
            const state = readGlobalState(win, ['__INITIAL_DATA__', '__INIT_DATA__', '_DATA_Detail']);
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
            const rawImages = imgSources(doc, TMALL_THUMB_SELECTORS);
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
        site: 'tmall',
        url,
        itemId,
        ...domMeta,
        extractor: { adapter: 'tmall' },
      },
    );
  },
};
