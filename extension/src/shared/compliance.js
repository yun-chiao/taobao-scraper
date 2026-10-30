// 台灣蝦皮合規檢查：禁用詞、商標、簡體字、未授權材質聲明與預購規則。純函式。
import { SHOPEE_TITLE_MAX, SHOPEE_MAX_IMAGES, PREORDER_THRESHOLD_DAYS } from './contract.js';

/** @typedef {import('./contract.js').ComplianceIssue} ComplianceIssue */
/** @typedef {import('./contract.js').Draft} Draft */
/** @typedef {import('./contract.js').Brand} Brand */
/** @typedef {import('./contract.js').Job} Job */

export const BANNED_WORDS = [
  // block: 誇大不實、最高級與醫療宣稱
  { regex: /最低價|全網最低|第一|No\.?1|頂級|絕對|100%有效/i, level: 'block', reason: '涉及誇大或最高級絕對化用語' },
  { regex: /治療|療效|醫療級|抗癌|瘦身|減肥|豐胸|壯陽/, level: 'block', reason: '涉及醫療效能或宣稱，違反台灣法規與蝦皮規範' },
  // warn: 淘寶式用語或需授權證明
  { regex: /正品|原廠|專櫃|官方授權/, level: 'warn', reason: '若無品牌授權書，標示「正品/專櫃」易遭檢舉下架' },
  { regex: /限時|秒殺|爆款|熱賣|新款|202\d/, level: 'warn', reason: '含淘寶促銷或年份贅字，建議移除以維持品牌質感' },
  // warn: 精品商標詞
  {
    regex: /Chanel|香奈兒|Dior|迪奧|LV|Louis\s*Vuitton|Gucci|Tiffany|Pandora|潘朵拉|Swarovski|施華洛世奇|Herm[eè]s|愛馬仕|Cartier|卡地亞|Van\s*Cleef|梵克雅寶|Celine|Prada|Bvlgari|寶格麗/i,
    level: 'warn',
    reason: '包含知名精品商標詞，誤用將觸發蝦皮侵權停權',
  },
];

export const MATERIAL_CLAIMS = {
  silver925: {
    label: '925 純銀',
    pattern: /【?\s*(?:S?925\s*全?純?銀|925\s*銀|純銀|sterling\s*silver)\s*】?/gi,
  },
  gold18k: {
    label: '18K 金',
    pattern: /【?\s*(?:18\s*[Kk]\s*金?|K金)\s*】?/g,
  },
  steel316: {
    label: '316L 醫療鋼',
    pattern: /【?\s*(?:316L?\s*(?:不鏽鋼|鈦鋼|鋼)?|醫療鋼)\s*】?/gi,
  },
  natural: {
    label: '天然石／珍珠',
    pattern: /【?\s*天然(?:水晶|珍珠|石|翡翠|瑪瑙|玉)\s*】?/g,
  },
};

export const SIMPLIFIED_CHARS = new Set(
  Array.from('们这个为说时会发来对国产让还过么问题样选项质码货顾买卖价包邮亲宝贝链接颜色尺寸纯银耳环项链戒指胸针发夹'),
);

export function isSimplified(text) {
  if (!text) return false;
  let hits = 0;
  for (const ch of text) {
    if (SIMPLIFIED_CHARS.has(ch)) {
      hits += 1;
      if (hits >= 2) return true;
    }
  }
  return false;
}

/**
 * 移除品牌未勾選授權的材質宣稱。
 * @param {string} text
 * @param {Brand['materialClaims']} materialClaims
 * @returns {{text: string, removed: string[]}}
 */
export function sanitizeClaims(text, materialClaims = {}) {
  if (!text) return { text: '', removed: [] };
  let cleaned = text;
  const removed = [];

  for (const [key, spec] of Object.entries(MATERIAL_CLAIMS)) {
    if (materialClaims && materialClaims[key]) continue;
    const matches = cleaned.match(spec.pattern);
    if (matches && matches.length > 0) {
      removed.push(spec.label);
      cleaned = cleaned.replace(spec.pattern, '');
    }
  }

  if (removed.length > 0) {
    cleaned = cleaned
      .replace(/【\s*】/g, '')
      .replace(/ {2,}/g, ' ')
      .trim();
  }

  return { text: cleaned, removed };
}

/**
 * 執行完整上架前合規檢查。
 * @param {Job} job
 * @param {Brand} brand
 * @returns {ComplianceIssue[]}
 */
export function checkCompliance(job, brand) {
  const issues = [];
  const draft = job?.draft;
  if (!draft) return issues;

  const title = (draft.title || '').trim();
  const desc = (draft.description || '').trim();
  const claims = brand?.materialClaims || {};

  // 1. 標題檢查
  const titleLen = Array.from(title).length;
  if (!title) {
    issues.push({ level: 'block', field: 'title', message: '商品標題不可為空' });
  } else if (titleLen > SHOPEE_TITLE_MAX) {
    issues.push({
      level: 'block',
      field: 'title',
      message: `標題超過蝦皮上限（${titleLen}/${SHOPEE_TITLE_MAX} 字）`,
      fix: Array.from(title).slice(0, SHOPEE_TITLE_MAX).join(''),
    });
  }

  // 2. 未勾選的材質聲明
  const titleSanitized = sanitizeClaims(title, claims);
  if (titleSanitized.removed.length > 0) {
    issues.push({
      level: 'block',
      field: 'title',
      message: `標題含未勾選確認的材質聲明（${titleSanitized.removed.join('、')}），避免不實標示檢舉`,
      fix: titleSanitized.text,
    });
  }
  const descSanitized = sanitizeClaims(desc, claims);
  if (descSanitized.removed.length > 0) {
    issues.push({
      level: 'block',
      field: 'description',
      message: `描述含未勾選確認的材質聲明（${descSanitized.removed.join('、')}）`,
      fix: descSanitized.text,
    });
  }

  // 3. 禁用詞與商標
  for (const rule of BANNED_WORDS) {
    const tm = title.match(rule.regex);
    if (tm) {
      issues.push({
        level: rule.level,
        field: 'title',
        message: `標題含「${tm[0]}」：${rule.reason}`,
        fix: title.replace(new RegExp(rule.regex.source, 'gi'), '').replace(/\s{2,}/g, ' ').trim(),
      });
    }
    const dm = desc.match(rule.regex);
    if (dm) {
      issues.push({
        level: rule.level,
        field: 'description',
        message: `描述含「${dm[0]}」：${rule.reason}`,
      });
    }
  }

  // 4. 簡體字檢查
  if (isSimplified(title)) {
    issues.push({ level: 'warn', field: 'title', message: '標題疑似殘留簡體字，建議改為繁體中文' });
  }
  if (isSimplified(desc)) {
    issues.push({ level: 'warn', field: 'description', message: '描述疑似殘留簡體字，建議改為繁體中文' });
  }

  // 5. 圖片數量
  const imgCount = draft.selectedImages?.length || 0;
  if (imgCount === 0) {
    issues.push({ level: 'block', field: 'images', message: '至少需勾選 1 張商品圖片' });
  } else if (imgCount > SHOPEE_MAX_IMAGES) {
    issues.push({ level: 'warn', field: 'images', message: `蝦皮最多支援 ${SHOPEE_MAX_IMAGES} 張圖片` });
  }

  // 6. 售價低於成本檢查
  if (draft.price?.final != null && draft.price?.costCny != null && draft.price.costCny > 0) {
    const baseTwd = draft.price.costCny * (draft.price.rate || 4.6) + (draft.price.shippingTwd || 0);
    if (draft.price.final < baseTwd) {
      issues.push({
        level: 'block',
        field: 'price',
        message: `設定售價 NT$${draft.price.final} 低於預估總成本 NT$${Math.round(baseTwd)}`,
      });
    }
  }

  // 7. 分類與預購提示
  if (!draft.categoryId) {
    issues.push({
      level: 'warn',
      field: 'general',
      message: '尚未填寫蝦皮分類代碼，批量上傳後需在「尚未刊登」補填',
    });
  }
  if ((draft.daysToShip || 0) > PREORDER_THRESHOLD_DAYS) {
    issues.push({
      level: 'info',
      field: 'general',
      message: `將以「預購商品」刊登（較長備貨 ${draft.daysToShip} 個工作天）`,
    });
  }

  const order = { block: 0, warn: 1, info: 2 };
  return issues.sort((a, b) => order[a.level] - order[b.level]);
}

/**
 * 套用單一 issue 的快速修復。
 * @param {Draft} draft
 * @param {ComplianceIssue} issue
 * @returns {Draft}
 */
export function applyFix(draft, issue) {
  if (!issue?.fix) return draft;
  if (issue.field === 'title') return { ...draft, title: issue.fix };
  if (issue.field === 'description') return { ...draft, description: issue.fix };
  return draft;
}
