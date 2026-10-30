// Alibaba 系 CDN 圖片網址還原與過濾。純函式，無 DOM、無 chrome.*。

/** @typedef {import('./contract.js').ProductImage} ProductImage */

const ALIBABA_HOST_PATTERN = /(?:alicdn\.com|taobaocdn\.com|tbcdn\.cn)/i;
const PRODUCT_PATH_PATTERN = /(?:imgextra|bao\/uploaded|img\/ibank)/i;
const BLACKLIST_PATTERN = /(?:icon|logo|tfs\/|\/assets\/|shop_logo|avatar|rank|spaceball|play|video|\.gif|tps-)/i;

/**
 * 將淘寶／天貓／1688 CDN 縮圖網址還原成原始高清大圖。
 * 規則：
 * 1. trim、// 開頭補上 https:
 * 2. 移除 query string 與 hash
 * 3. 移除阿里巴巴 CDN 常見縮圖後綴（如 _460x460.jpg、_.webp、_q90.jpg、.220x220.jpg 等）
 * @param {string|null|undefined} rawUrl
 * @returns {string|null}
 */
export function toHiRes(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  let url = rawUrl.trim();
  if (!url) return null;

  if (url.startsWith('//')) url = 'https:' + url;

  // 去掉 query string 與 hash
  url = url.split(/[?#]/)[0];

  // 若非阿里 CDN，直接回傳清理過的 URL
  if (!ALIBABA_HOST_PATTERN.test(url)) return url;

  // 1. 處理如 .220x220.jpg 的形式 (例如 cbu01.alicdn.com/img/ibank/O1CN01pqr.220x220.jpg)
  url = url.replace(/\.\d+x\d+.*\.jpg$/i, '.jpg');

  // 2. 若原檔名本身已有副檔名，且後綴以底線附加縮圖或轉碼參數：
  //    例如 file.jpg_460x460q90.jpg_.webp -> file.jpg
  //    例如 TB1xyz.jpg_400x400.jpg -> TB1xyz.jpg
  //    例如 file.png_80x80.jpg_.webp -> file.png
  //    例如 file.jpg_.webp -> file.jpg
  //    例如 file.jpg_q50.jpg -> file.jpg
  //    例如 2020/123/456.jpg_b.jpg -> 2020/123/456.jpg
  if (/(\.(?:jpg|jpeg|png|webp))_[\w.-]+$/i.test(url)) {
    url = url.replace(/(\.(?:jpg|jpeg|png|webp))_[\w.-]+$/i, '$1');
  } else {
    // 3. 原檔名沒有副檔名、直接以 _50x50.jpg 或 _b.jpg 結尾的罕見形式：
    //    例如 O1CN01jkl_50x50.jpg -> O1CN01jkl.jpg
    url = url.replace(/_\d+x\d+.*\.([a-z]+)$/i, '.$1');
  }

  // 4. 清理殘留的結尾轉碼後綴
  url = url.replace(/(\.(?:jpg|jpeg|png))_\.webp$/i, '$1');

  return url;
}

/**
 * 判斷是否為商品圖（排除 icon、按鈕、裝飾圖、店鋪 logo）。
 * @param {string|null|undefined} url
 * @returns {boolean}
 */
export function isLikelyProductImage(url) {
  if (!url || typeof url !== 'string') return false;
  const clean = url.trim().toLowerCase();
  if (!ALIBABA_HOST_PATTERN.test(clean)) return false;
  if (!PRODUCT_PATH_PATTERN.test(clean)) return false;
  if (BLACKLIST_PATTERN.test(clean)) return false;
  return true;
}

/**
 * 依 hiRes 去重，保留第一次出現的項目。
 * @param {ProductImage[]} images
 * @returns {ProductImage[]}
 */
export function dedupeImages(images) {
  if (!Array.isArray(images)) return [];
  const seen = new Set();
  const result = [];
  for (const img of images) {
    if (!img?.hiRes) continue;
    if (!seen.has(img.hiRes)) {
      seen.add(img.hiRes);
      result.push(img);
    }
  }
  return result;
}

/**
 * 批次正規化圖片網址：清理、過濾、去重、限制張數。
 * @param {(string|null|undefined)[]} urls
 * @param {{max?: number, filter?: boolean}} [options]
 * @returns {ProductImage[]}
 */
export function normalizeImages(urls, { max = 9, filter = true } = {}) {
  if (!Array.isArray(urls)) return [];
  const candidates = [];

  for (const raw of urls) {
    if (!raw) continue;
    if (filter && !isLikelyProductImage(raw)) continue;
    const hiRes = toHiRes(raw);
    if (hiRes) {
      candidates.push({ url: raw.trim(), hiRes });
    }
  }

  return dedupeImages(candidates).slice(0, max);
}
