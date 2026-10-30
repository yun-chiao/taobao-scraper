// Listio — 首圖模板定義（純資料，無 chrome.*、無 DOM）。
//
// 每個模板只描述「排版參數」：區塊位置、尺寸、字級、行高、圓角……全部以 size 的比例表示
// （0–1），所以同一份設計可以輸出任何邊長的正方形。顏色一律來自 brand.palette，
// 真正的繪製邏輯在 renderer.js，依 template.id 選擇對應的畫法。

/**
 * @typedef {Object} LayoutBox  以 size 比例描述的矩形
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */

/**
 * @typedef {Object} CoverTemplate
 * @property {string} id
 * @property {string} name                使用者可見名稱（繁中）
 * @property {string} description         一句話說明適合的用途
 * @property {'sans'|'serif'} fontFamily  標題字體家族（字體堆疊定義在 renderer.js）
 * @property {Record<string, any>} layout  幾何／字級參數（皆為 size 的比例；字距為字級的倍數）
 */

export const DEFAULT_TEMPLATE_ID = 'badge-classic';

/** @type {readonly CoverTemplate[]} */
export const TEMPLATES = deepFreeze([
  {
    id: 'badge-classic',
    name: '經典徽章',
    description: '柔和底色、圓形品牌徽章與霧面標題列，最通用的款式。',
    fontFamily: 'sans',
    layout: {
      highlight: { cx: 0.3, cy: 0.22, r: 0.8, alpha: 0.55 },
      badge: { cx: 0.14, cy: 0.14, r: 0.085, ringWidth: 0.004, ringInset: 0.012, fontSize: 0.031, lineHeight: 1.18, weight: 700 },
      tagline: { right: 0.07, y: 0.14, fontSize: 0.021, weight: 500, alpha: 0.75 },
      frame: {
        x: 0.07, y: 0.25, w: 0.86, h: 0.5, radius: 0.035, padding: 0.018,
        borderWidth: 0.0025, shadowBlur: 0.03, shadowOffsetY: 0.012,
      },
      titleBar: {
        x: 0.07, y: 0.77, w: 0.86, h: 0.155, radius: 0.028, paddingX: 0.035,
        fontSize: 0.0475, lineHeight: 1.3, maxLines: 2, weight: 700, alpha: 0.82,
      },
    },
  },
  {
    id: 'editorial',
    name: '雜誌風',
    description: '大圖滿版搭配襯線標題與字距拉開的品牌名，像雜誌內頁。',
    fontFamily: 'serif',
    layout: {
      image: { x: 0, y: 0, w: 1, h: 0.66 },
      padding: 0.065,
      brandName: { y: 0.715, fontSize: 0.021, letterSpacing: 0.25, weight: 700 },
      rule: { y: 0.757, w: 0.075, h: 0.004 },
      title: { y: 0.79, fontSize: 0.046, lineHeight: 1.32, maxLines: 2, weight: 600 },
      tagline: { bottom: 0.045, fontSize: 0.019, weight: 400, alpha: 0.6, maxWidth: 0.6 },
    },
  },
  {
    id: 'polaroid',
    name: '拍立得',
    description: '白色相紙卡片、手寫感標題與小膠囊標籤，輕鬆有溫度。',
    fontFamily: 'sans',
    layout: {
      highlight: { cx: 0.5, cy: 0.45, r: 0.75, alpha: 0.22 },
      card: {
        x: 0.14, y: 0.05, w: 0.72, h: 0.9, radius: 0.012, rotationDeg: -1.5,
        padding: 0.035, shadowBlur: 0.06, shadowOffsetY: 0.028,
      },
      pill: { inset: 0.028, fontSize: 0.021, paddingX: 0.02, height: 0.046, weight: 700 },
      title: { offsetY: 0.028, fontSize: 0.038, lineHeight: 1.32, maxLines: 2, weight: 500, italic: true },
      footer: { bottom: 0.036, fontSize: 0.019, weight: 500, alpha: 0.8 },
    },
  },
  {
    id: 'bold',
    name: '大膽色塊',
    description: '滿版主題色、粗體大字與圓角大圖，社群感強、最吸睛。',
    fontFamily: 'sans',
    layout: {
      chip: { x: 0.06, y: 0.06, fontSize: 0.022, paddingX: 0.022, height: 0.052, weight: 700 },
      title: {
        x: 0.06, y: 0.15, maxWidth: 0.88, fontSize: 0.056, lineHeight: 1.45, maxLines: 2, weight: 800,
        pillPaddingX: 0.022, pillRadius: 0.018, pillAlpha: 0.28,
      },
      image: { x: 0.34, y: 0.36, w: 0.58, radius: 0.05, borderWidth: 0.008, shadowBlur: 0.07, shadowOffsetY: 0.03 },
      tagline: { x: 0.06, bottom: 0.06, maxWidth: 0.24, fontSize: 0.02, lineHeight: 1.4, maxLines: 3, weight: 500, alpha: 0.85 },
    },
  },
]);

/** @type {readonly string[]} */
export const TEMPLATE_IDS = Object.freeze(TEMPLATES.map((template) => template.id));

/**
 * 依 id 取得模板；找不到（或 id 無效）時回傳第一款，呼叫端永遠拿得到可用的模板。
 * @param {string|null|undefined} id
 * @returns {CoverTemplate}
 */
export function getTemplate(id) {
  return TEMPLATES.find((template) => template.id === id) ?? TEMPLATES[0];
}

/** 遞迴凍結，避免模板資料在執行期被意外改寫。 */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}
