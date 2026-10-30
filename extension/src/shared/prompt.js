// Prompt 組裝（BYOK 模式）與模型輸出 → 文案組版。純函式。
// Cloud 模式的 prompt 在 server/src/lib/prompts.js；兩邊規則需一致。
import { SHOPEE_TITLE_MAX } from './contract.js';
import { PERSONA_PRESETS } from './brands.js';

/** @typedef {import('./contract.js').Brand} Brand */
/** @typedef {import('./contract.js').Product} Product */
/** @typedef {import('./contract.js').Generated} Generated */

const MATERIAL_LABEL = {
  silver925: 'S925 純銀（親膚抗敏）',
  gold18k: '18K 金',
  steel316: '316L 醫療鋼（不褪色、不過敏）',
  natural: '天然石／珍珠',
};

const MATERIAL_TITLE_TAG = { silver925: '925純銀', gold18k: '18K金', steel316: '316L鋼', natural: '天然' };

/**
 * @param {Brand} brand
 * @param {{field?:'all'|'title'|'description', toneOverride?:string|null, platform?:string}} options
 */
export function buildSystemPrompt(brand, options = {}) {
  const p = brand.persona;
  const preset = PERSONA_PRESETS[p.presetId] || PERSONA_PRESETS.warm;
  const tone = p.tone || preset.tone;
  const styleTags = (p.styleTags?.length ? p.styleTags : preset.styleTags).join('、');
  const platform = options.platform === 'instagram' ? 'Instagram 貼文' : '蝦皮（Shopee 台灣）商品頁';

  return [
    `你是台灣品牌「${brand.name}」的品牌主理人兼文案長。${brand.tagline ? `品牌一句話：${brand.tagline}。` : ''}`,
    `語氣規範：${tone}`,
    `語言：繁體中文、台灣慣用語，禁止任何簡體字與中國用語（例如「質量」改「品質」、「視頻」改「影片」）。`,
    `任務：根據商品資料${options.field === 'title' ? '（這次只需重寫標題，其餘欄位維持高品質即可）' : options.field === 'description' ? '（這次只需重寫描述，標題維持高品質即可）' : ''}，撰寫適合 ${platform} 的內容，並以 JSON 回傳。`,
    '',
    '標題規則：',
    `- 不含品牌名（系統會自動加上「${brand.name}｜」前綴），總長度 ≤ ${SHOPEE_TITLE_MAX - brand.name.length - 1} 字。`,
    '- 最重要的搜尋關鍵字放最前面（品類＋核心特徵），再接風格與情境詞。',
    `- 必須恰好包含 1 個風格標籤，從這個池子裡選：${styleTags}。`,
    '- 禁止：年份（2025、2026…）、「新款」「爆款」「熱賣」「正品」「最」「第一」等字眼。',
    '',
    '描述結構（請分別填進對應欄位，不要在 body 裡重複 slogan 或招牌段落）：',
    '- slogan：一句有畫面感的話，≤ 30 字。',
    '- body：2–3 段，描述設計重點、穿搭或使用情境（約會、通勤、旅行、送禮…），每段 2–4 句。',
    `- signature：招牌段落「${p.signatureTitle}」的內容。${p.signatureHint}`,
    '- details：3–6 項商品細節（風格、顏色、尺寸、工藝、適合場合…）。',
    '- tags：5–8 個台灣買家會搜尋的關鍵字。',
    '',
    '材質政策（非常重要）：',
    '- 你「不可以」斷言材質（例如 925 純銀、18K 金、316L 鋼、天然石）。材質聲明由賣家在系統中勾選。',
    '- 你只能把從圖片或原始標題觀察到的線索放進 materialHints（例如「標題提到 S925」「圖片看起來是霧面金屬」）。',
    '- details 與 body 裡請用「金屬」「鍍色」「寶石造型」等中性描述。',
    '',
    `Emoji：${p.emoji ? '可以少量點綴（如 ♡、・），每段最多 1 個，不要放 🏷️ 📦 🔥 💥 等廉價促銷符號。' : '全文不要使用任何 emoji 或表情符號，保持乾淨版面。'}`,
    '不要輸出任何問候、說明或 markdown，只輸出 JSON。',
    p.customPrompt ? `\n賣家額外寫作習慣與叮嚀（請務必遵守）：\n${p.customPrompt}` : '',
    options.toneOverride ? `\n這次的額外語氣要求：${options.toneOverride}` : '',
  ]
    .filter((line) => line !== null && line !== undefined)
    .join('\n');
}

/**
 * 組成 Gemini `contents`（含主圖 inline data）。
 * @param {Product} product
 * @param {{mimeType:string,dataBase64:string}|null} image
 */
export function buildUserParts(product, image) {
  const attrs = Object.entries(product.attrs || {})
    .slice(0, 20)
    .map(([k, v]) => `${k}：${v}`)
    .join('\n');
  const skus = (product.skus || [])
    .slice(0, 5)
    .map((s) => `${s.name}：${s.options.slice(0, 12).join(' / ')}`)
    .join('\n');
  const text = [
    `商品原始標題（${product.site}，通常是簡體、堆疊關鍵字，僅供參考）：${product.title}`,
    attrs ? `商品屬性：\n${attrs}` : '',
    skus ? `規格選項：\n${skus}` : '',
    product.price?.amount ? `來源售價：¥${product.price.amount}` : '',
    image ? '附上主圖，請觀察造型、顏色、質感後再寫。' : '沒有圖片，請只依文字資訊撰寫，並在 warnings 註明。',
  ]
    .filter(Boolean)
    .join('\n\n');

  const parts = [{ text }];
  if (image) parts.push({ inlineData: { mimeType: image.mimeType, data: image.dataBase64 } });
  return parts;
}

/**
 * 模型輸出 → 蝦皮標題（含品牌前綴與使用者宣告的材質標籤）。
 * @param {Generated} generated
 * @param {Brand} brand
 */
export function composeTitle(generated, brand) {
  const tags = Object.entries(brand.materialClaims || {})
    .filter(([, on]) => on)
    .map(([k]) => `【${MATERIAL_TITLE_TAG[k]}】`)
    .slice(0, 1)
    .join('');
  const core = cleanTitle(generated.title || '');
  const full = `${brand.name}｜${tags}${core}`;
  return full.length > SHOPEE_TITLE_MAX ? truncateTitle(full, SHOPEE_TITLE_MAX) : full;
}

/**
 * 模型輸出 → 完整商品描述。
 * @param {Generated} generated
 * @param {Brand} brand
 */
export function composeDescription(generated, brand) {
  const details = [...(generated.details || [])];
  const claimed = Object.entries(brand.materialClaims || {})
    .filter(([, on]) => on)
    .map(([k]) => MATERIAL_LABEL[k]);
  if (claimed.length) {
    const idx = details.findIndex((d) => /材質/.test(d.label));
    const line = { label: '材質', value: claimed.join('、') };
    if (idx >= 0) details[idx] = line;
    else details.unshift(line);
  }
  const sigTitle = (brand.persona?.signatureTitle || '').trim();
  const formattedSigTitle = sigTitle
    ? /^[\[【]/.test(sigTitle)
      ? sigTitle
      : `【${sigTitle}】`
    : '';

  const blocks = [
    generated.slogan ? `${stripQuotes(generated.slogan)}` : '',
    (generated.body || '').trim(),
    generated.signature && formattedSigTitle ? `${formattedSigTitle}\n${generated.signature.trim()}` : '',
    details.length ? `【商品規格】\n${details.map((d) => `・${d.label}：${d.value}`).join('\n')}` : '',
    (brand.shippingNote || '').trim(),
  ].filter(Boolean);
  const text = blocks.join('\n\n');
  return brand.persona.emoji ? text : stripEmoji(text);
}

export function cleanTitle(title) {
  return title
    .replace(/\s+/g, ' ')
    .replace(/20\d\d\s*(年)?(新款|爆款|款)?/g, '')
    .replace(/(新款|爆款|熱賣|正品)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function truncateTitle(title, max) {
  // 優先在分隔符號處截斷，避免把詞切半。
  const cut = title.slice(0, max);
  const lastSep = Math.max(cut.lastIndexOf(' '), cut.lastIndexOf('・'), cut.lastIndexOf('｜'), cut.lastIndexOf('】'));
  return (lastSep > max * 0.6 ? cut.slice(0, lastSep + (cut[lastSep] === '】' ? 1 : 0)) : cut).trim();
}

function stripQuotes(s) {
  return s.replace(/^[「"“']+|[」"”']+$/g, '').trim();
}

function stripEmoji(s) {
  return s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}\u{2764}\u{2661}\u{FE0F}]/gu, '').replace(/ {2,}/g, ' ');
}

/** 把模型回傳的任意物件補成合法的 Generated（缺欄位不會讓 UI 爆掉）。 @returns {Generated} */
export function normalizeGenerated(raw) {
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const arr = (v) => (Array.isArray(v) ? v : []);
  return {
    title: str(raw?.title),
    slogan: str(raw?.slogan),
    body: str(raw?.body),
    signature: str(raw?.signature),
    details: arr(raw?.details)
      .map((d) => ({ label: str(d?.label), value: str(d?.value) }))
      .filter((d) => d.label && d.value),
    tags: [...new Set(arr(raw?.tags).map(str).filter(Boolean))].slice(0, 8),
    style: str(raw?.style),
    materialHints: arr(raw?.materialHints).map(str).filter(Boolean),
    warnings: arr(raw?.warnings).map(str).filter(Boolean),
  };
}
