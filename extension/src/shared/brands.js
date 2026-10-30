// 品牌人設預設與預設品牌。純資料，無 chrome.*。
import { DEFAULT_MODEL, uid } from './contract.js';

/** @typedef {import('./contract.js').Brand} Brand */
/** @typedef {import('./contract.js').Persona} Persona */

/**
 * 四種賣場說話口吻預設：去 AI 口號感，貼近真實台灣選物／飾品賣家日常寫法。
 */
export const PERSONA_PRESETS = {
  warm: {
    id: 'warm',
    name: '日常親切',
    subtitle: '像闆娘跟熟客聊穿搭與配戴感受',
    tone: '親切自然、像台灣選物店老闆跟熟客介紹單品；多講實際配戴感受與日常怎麼搭，不寫浮誇口號。',
    styleTags: ['韓系', '溫柔', '簡約', '日常', '法式', '復古'],
    signatureTitle: '實戴筆記',
    signatureHint: '用第一人稱分享實際拿在手上的質感、重量感，以及平常上班或週末怎麼搭配。',
    sample: '霧面拉絲本人很有質感，搭白襯衫或素色針織都很順眼，戴一整天耳垂也不會有負擔。',
    previewGenerated: {
      title: '弧面摺疊霧面拉絲耳針 簡約日常 通勤百搭耳環',
      slogan: '低調耐看的霧面金屬光澤，每天出門順手就能戴上。',
      body: '流暢的弧面摺疊線條取代生硬稜角，表面做了細緻的拉絲霧化處理，近看很有層次感。\n\n不論配白襯衫、西裝外套或週末的素色針織衫都很協調，尺寸剛好貼合耳垂，久戴也不覺厚重。',
      signature: '實品拿在手上的拉絲紋路很細膩，不是那種刺眼的亮金屬。銀色清爽俐落、金色帶一點溫暖復古感，兩色都很實搭。',
    },
  },
  minimal: {
    id: 'minimal',
    name: '乾淨俐落',
    subtitle: '只講版型、比例與重點，不多廢話',
    tone: '克制、精準、少形容詞；只清楚交代線條比例、表面處理、重量與適合場景，不使用驚嘆號。',
    styleTags: ['極簡', '冷淡風', '簡約', '中性', '日系', '設計感'],
    signatureTitle: '細節說明',
    signatureHint: '用兩三句話客觀補充版型比例、配戴體感與適合場合，不加情緒字眼。',
    sample: '弧面立體摺疊，表面拉絲霧化處理。單只約 1.5g，適合日常通勤配戴。',
    previewGenerated: {
      title: '幾何摺疊拉絲耳針 極簡冷淡風 霧面金屬耳環',
      slogan: '',
      body: '立體弧面摺疊結構，表面以細拉絲霧化處理，降低金屬反光，呈現乾淨內斂的輪廓。\n\n貼耳式尺寸約 1.2 × 0.8 cm，單只重量輕巧，適合日常通勤與俐落穿搭。',
      signature: '耳針位置偏中上，配戴時能自然修飾耳垂比例，短髮或挽髮時線條特別清楚。',
    },
  },
  playful: {
    id: 'playful',
    name: '閨蜜推坑',
    subtitle: '口語短句，點出拍照與修飾臉型重點',
    tone: '輕鬆口語、節奏明快，像朋友私訊推坑好物；點出「拍照好看、不挑臉型、上班戴也不誇張」等真實心聲。',
    styleTags: ['韓系', '甜酷', '小眾', '百搭', '約會穿搭', '美式復古'],
    signatureTitle: '闆娘真心話',
    signatureHint: '像跟好朋友聊天一樣，直白分享為什麼自己也自留、戴出門好不好搭。',
    sample: '這副本人真的超精緻，側面看有立體弧度，上班戴低調、週末約會也很有重點。',
    previewGenerated: {
      title: '立體摺疊霧面拉絲耳針 韓系百搭 小臉修飾耳環',
      slogan: '看似簡單卻超有細節的一副，隨便搭件素 T 都好看。',
      body: '不是平平一片的金屬喔，它是有弧度的立體摺疊，轉頭的時候會有很柔和的霧面光澤，拍照很上鏡。\n\n大小抓得剛剛好，上班開會戴不會太高調，下班直接去聚餐也很有精緻度。',
      signature: '這副我自己先自留拉絲金，完全不挑膚色，早上趕出門不知道戴什麼抓它準沒錯。',
    },
  },
  luxury: {
    id: 'luxury',
    name: '選物店誌',
    subtitle: '偏重工藝紋理、金屬色澤與場合質感',
    tone: '沉穩優雅、重細節描寫；強調工藝層次、光澤質感與正式／送禮場合，用詞精煉不推銷。',
    styleTags: ['輕奢', '法式', '質感', '優雅', '通勤穿搭', '復古'],
    signatureTitle: '選品小記',
    signatureHint: '從選物角度說明工藝細節、色澤表現，以及適合搭配的服裝材質。',
    sample: '以柔和曲面收束光影，霧金光澤溫潤內斂，正裝與休閒場合皆能從容駕馭。',
    previewGenerated: {
      title: '流體摺疊手工拉絲耳針 法式輕奢 霧面質感耳環',
      slogan: '溫潤內斂的霧面金屬肌理，為日常衣著添一分從容細節。',
      body: '以柔和起伏的曲面表現金屬張力，細密的拉絲紋理讓光線呈現溫潤漫射，呈現耐人尋味的低調質感。\n\n無論搭配挺版西裝、絲質襯衫或秋冬羊毛大衣，皆能恰如其分地襯托整體氣質，亦適合做為日常贈禮。',
      signature: '特別喜歡它邊緣圓潤的收邊處理，近看能感受到紮實的金屬份量，卻依然維持輕盈舒適的配戴感。',
    },
  },
};

export const PERSONA_PRESET_LIST = Object.values(PERSONA_PRESETS);

/**
 * @param {keyof typeof PERSONA_PRESETS} presetId
 * @returns {Persona}
 */
export function personaFromPreset(presetId = 'warm') {
  const p = PERSONA_PRESETS[presetId] || PERSONA_PRESETS.warm;
  return {
    presetId: p.id,
    tone: p.tone,
    styleTags: [...p.styleTags],
    signatureTitle: p.signatureTitle,
    signatureHint: p.signatureHint,
    emoji: false,
    customPrompt: '',
  };
}

export const PALETTE_PRESETS = [
  { id: 'cream', name: '奶油', bg: '#FFF9F3', fg: '#4A4A4A', accent: '#C9814B' },
  { id: 'sage', name: '鼠尾草', bg: '#F1F5EF', fg: '#2F3B33', accent: '#6E8B6A' },
  { id: 'ink', name: '墨藍', bg: '#0F1B2D', fg: '#F4F1EA', accent: '#E8613C' },
  { id: 'blush', name: '裸粉', bg: '#FBF1F0', fg: '#4B3A3A', accent: '#D97B8A' },
  { id: 'mono', name: '黑白', bg: '#FFFFFF', fg: '#111111', accent: '#111111' },
  { id: 'lilac', name: '丁香', bg: '#F4F0FA', fg: '#3B3350', accent: '#8B6FC7' },
];

export const DEFAULT_SHIPPING_NOTE =
  '【購買與出貨須知】\n・現貨商品 2 日內寄出；預購追加約 7–12 個工作天抵台寄出。\n・配戴後建議以乾布輕拭汗水並收入夾鏈袋保存，避免接觸香水與溫泉。';

export const FOOTER_SNIPPETS = [
  {
    label: '預購與現貨天數',
    text: '・出貨時間：現貨 2 日內寄出；預購商品下單後約 7–12 個工作天抵台寄出，急單請先私訊確認。',
  },
  {
    label: '飾品保養方式',
    text: '・保養提醒：配戴後請以乾布輕拭汗水並放入密封袋保存，洗澡、泡湯與噴香水時建議取下。',
  },
  {
    label: '色差與退換須知',
    text: '・貼心提醒：商品皆為實品拍攝，因螢幕顯色與光線可能略有差異；耳針類商品屬個人衛生用品，拆封後恕不退換。',
  },
];

/**
 * 建立一個新品牌（所有欄位都有合理預設）。
 * @param {Partial<Brand>} init
 * @returns {Brand}
 */
export function newBrand(init = {}) {
  const palette = PALETTE_PRESETS[0];
  return {
    id: uid('brand'),
    name: '我的賣場',
    badgeText: '我的\n賣場',
    tagline: '',
    persona: personaFromPreset('warm'),
    shippingNote: DEFAULT_SHIPPING_NOTE,
    palette: { bg: palette.bg, fg: palette.fg, accent: palette.accent },
    coverTemplateId: 'badge-classic',
    pricing: { rate: 4.6, shippingTwd: 25, feeRate: 0.1, marginRate: 0.35, rounding: '9' },
    materialClaims: { silver925: false, gold18k: false, steel316: false, natural: false },
    defaults: { daysToShip: 10, stock: 20, weightKg: 0.05, categoryId: '' },
    ...init,
    ...(init.persona ? { persona: { ...personaFromPreset('warm'), ...init.persona } } : {}),
  };
}

/** 第一次安裝時建立的示範品牌。 */
export function seedBrand() {
  return newBrand({
    id: 'brand_mimi',
    name: 'Mimi 飾物所',
    badgeText: 'Mimi\n飾物所',
    tagline: '日常選物飾品',
    persona: { ...personaFromPreset('warm'), signatureTitle: '實戴筆記' },
  });
}

/** @returns {import('./contract.js').Settings} */
export function defaultSettings() {
  return {
    // 預設走 Listio 雲端：安裝即可免費產生 10 件，不需註冊、不需 API Key。
    // 'byok' 為進階選項（設定 → 方案與金鑰），自備 Gemini 金鑰不計件數。
    mode: 'cloud',
    geminiApiKey: '',
    model: DEFAULT_MODEL,
    backendUrl: 'https://api.listio.app',
    authToken: '',
    deviceId: '',
    gasUrl: '',
    activeBrandId: 'brand_mimi',
    telemetry: true,
    onboarded: false,
  };
}
