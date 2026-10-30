// 蝦皮（Shopee 台灣）批量上傳範本與簡易表匯出定義。純函式，不依賴 SheetJS。
// 注意：蝦皮賣家中心不定期微調大量上傳範本的表頭。若欄位有變動，只需調整下方 SHOPEE_TW_MASS_UPLOAD.columns。
import { PREORDER_THRESHOLD_DAYS } from './contract.js';

/** @typedef {import('./contract.js').Job} Job */
/** @typedef {import('./contract.js').Brand} Brand */

const EXCEL_CELL_MAX_CHARS = 32000;

function pickPublicImageUrl(img) {
  if (!img) return '';
  for (const candidate of [img.publicUrl, img.hiRes, img.url]) {
    if (typeof candidate === 'string' && /^https?:\/\//i.test(candidate)) {
      return candidate;
    }
  }
  return '';
}

function orderedImageUrls(job) {
  const imgs = job?.product?.images || [];
  const selected = job?.draft?.selectedImages || [];
  const coverIdx = job?.draft?.coverImageIndex ?? 0;

  const list = [];
  const coverUrl = pickPublicImageUrl(imgs[coverIdx]);
  if (coverUrl) list.push(coverUrl);
  for (const idx of selected) {
    if (idx !== coverIdx) {
      const u = pickPublicImageUrl(imgs[idx]);
      if (u) list.push(u);
    }
  }
  return list;
}

const imageColumns = Array.from({ length: 9 }, (_, i) => ({
  key: i === 0 ? 'ps_item_cover_image' : `ps_item_image_${i + 1}`,
  header: i === 0 ? '主圖（商品圖片 1）' : `商品圖片 ${i + 1}`,
  required: i === 0,
  description: i === 0 ? '商品首圖公開網址（必填）' : `第 ${i + 1} 張商品圖片網址（選填）`,
  example: 'https://img.alicdn.com/imgextra/...jpg',
  from: (job) => orderedImageUrls(job)[i] || '',
}));

export const SHOPEE_TW_MASS_UPLOAD = {
  id: 'shopee-tw-mass-upload',
  name: '蝦皮批量上傳範本（台灣）',
  headerRows: 5,
  columns: [
    {
      key: 'ps_category',
      header: '商品分類代碼',
      required: true,
      description: '請填入蝦皮分類代碼（可於賣家中心分類表查詢）',
      example: '100636',
      from: (job) => job?.draft?.categoryId || '',
    },
    {
      key: 'ps_product_name',
      header: '商品名稱',
      required: true,
      description: '商品標題（上限 60 字）',
      example: 'Mimi 飾物所｜【輕奢】流動幾何極簡拉絲耳釘',
      from: (job) => job?.draft?.title || '',
    },
    {
      key: 'ps_product_description',
      header: '商品描述',
      required: true,
      description: '完整商品文案與規格說明',
      example: '「光影的摺痕就是妳最迷人的氣場。」...',
      from: (job) => job?.draft?.description || '',
    },
    {
      key: 'ps_parent_sku',
      header: '主商品貨號',
      required: false,
      description: '賣家自訂主貨號（選填）',
      example: 'TB-7312345678',
      from: (job) => (job?.product?.itemId ? `${job.product.site.toUpperCase()}-${job.product.itemId}` : ''),
    },
    {
      key: 'ps_price',
      header: '價格',
      required: true,
      description: '新台幣售價（正整數）',
      example: '299',
      from: (job) => (job?.draft?.price?.final != null ? job.draft.price.final : ''),
    },
    {
      key: 'ps_stock',
      header: '庫存',
      required: true,
      description: '可售庫存數量',
      example: '20',
      from: (job) => job?.draft?.stock ?? 20,
    },
    {
      key: 'ps_weight',
      header: '商品重量 (kg)',
      required: true,
      description: '含包裝重量（公斤）',
      example: '0.05',
      from: (job) => job?.draft?.weightKg ?? 0.05,
    },
    {
      key: 'ps_length',
      header: '長 (cm)',
      required: false,
      description: '包裹長度（選填）',
      example: '',
      from: () => '',
    },
    {
      key: 'ps_width',
      header: '寬 (cm)',
      required: false,
      description: '包裹寬度（選填）',
      example: '',
      from: () => '',
    },
    {
      key: 'ps_height',
      header: '高 (cm)',
      required: false,
      description: '包裹高度（選填）',
      example: '',
      from: () => '',
    },
    {
      key: 'ps_days_to_ship',
      header: '出貨天數',
      required: true,
      description: '現貨填 2；較長備貨（預購）填 5–30',
      example: '10',
      from: (job) => job?.draft?.daysToShip ?? 10,
    },
    {
      key: 'ps_pre_order',
      header: '較長備貨（預購）',
      required: false,
      description: '出貨天數 > 2 時自動標為「是」',
      example: '是',
      from: (job) => ((job?.draft?.daysToShip ?? 10) > PREORDER_THRESHOLD_DAYS ? '是' : '否'),
    },
    {
      key: 'ps_condition',
      header: '商品狀況',
      required: false,
      description: '全新 / 二手',
      example: '全新',
      from: () => '全新',
    },
    {
      key: 'ps_brand',
      header: '品牌',
      required: false,
      description: '自有品牌名稱',
      example: 'Mimi 飾物所',
      from: (job, ctx) => ctx?.brandsById?.[job?.brandId]?.name || '自有品牌',
    },
    ...imageColumns,
  ],
};

export const SIMPLE_SHEET = {
  id: 'simple',
  name: '簡易工作表（相容舊版）',
  headerRows: 1,
  columns: [
    { key: 'title', header: '商品名稱', required: true, from: (job) => job?.draft?.title || '' },
    { key: 'description', header: '商品描述', required: true, from: (job) => job?.draft?.description || '' },
    { key: 'price', header: '售價 (NT$)', required: true, from: (job) => job?.draft?.price?.final ?? '' },
    {
      key: 'preorder',
      header: '預購',
      required: false,
      from: (job) => ((job?.draft?.daysToShip ?? 10) > PREORDER_THRESHOLD_DAYS ? '是' : '否'),
    },
    { key: 'daysToShip', header: '出貨天數', required: false, from: (job) => job?.draft?.daysToShip ?? 10 },
    ...Array.from({ length: 5 }, (_, i) => ({
      key: `img_${i + 1}`,
      header: `商品圖片 ${i + 1}`,
      required: i === 0,
      from: (job) => orderedImageUrls(job)[i] || '',
    })),
    { key: 'sourceUrl', header: '來源網址', required: false, from: (job) => job?.product?.url || '' },
  ],
};

export const PRESETS = [SHOPEE_TW_MASS_UPLOAD, SIMPLE_SHEET];

export function getPreset(id) {
  return PRESETS.find((p) => p.id === id) || SHOPEE_TW_MASS_UPLOAD;
}

/**
 * 建立二維陣列供 SheetJS `aoa_to_sheet` 轉換。
 * @param {typeof SHOPEE_TW_MASS_UPLOAD} preset
 * @param {Job[]} jobs
 * @param {{brandsById?: Record<string, Brand>}} [ctx]
 * @returns {(string|number)[][]}
 */
export function buildWorkbookRows(preset, jobs, ctx = {}) {
  const cols = preset.columns;
  const rows = [];

  if (preset.headerRows === 5) {
    const pad = (arr) => [...arr, ...Array(Math.max(0, cols.length - arr.length)).fill('')];
    rows.push(pad([preset.name, `由 Listio 產生 (${new Date().toISOString().slice(0, 10)})`]));
    rows.push(cols.map((c) => c.key));
    rows.push(cols.map((c) => (c.required ? '必填' : '選填')));
    rows.push(cols.map((c) => `${c.header} — ${c.description || ''}`));
    rows.push(cols.map((c) => c.example || ''));
  } else {
    rows.push(cols.map((c) => c.header));
  }

  for (const job of jobs || []) {
    rows.push(
      cols.map((c) => {
        try {
          const val = c.from(job, ctx);
          if (val == null) return '';
          if (typeof val === 'string' && val.length > EXCEL_CELL_MAX_CHARS) {
            return val.slice(0, EXCEL_CELL_MAX_CHARS);
          }
          return val;
        } catch {
          return '';
        }
      }),
    );
  }

  return rows;
}

export function buildClipboardText(job) {
  const title = job?.draft?.title || '';
  const desc = job?.draft?.description || '';
  return `${title}\n\n${desc}`.trim();
}

export function filenameFor(preset, jobs) {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const count = Array.isArray(jobs) ? jobs.length : 1;
  const prefix = preset?.id === 'simple' ? '蝦皮簡易表' : '蝦皮批量上傳';
  return `${prefix}_${ymd}_${count}件.xlsx`;
}
