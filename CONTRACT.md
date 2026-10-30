# Listio — 介面合約（所有模組的單一事實來源）

> 專案：Listio（上架所）— 把淘寶／天貓／1688 商品頁變成有品牌感的蝦皮商品頁。
> 這份文件定義模組之間的邊界。任何人改介面，先改這裡與 `extension/src/shared/contract.js`。

## 0. 目錄

```
listio/
  extension/                 Chrome MV3 擴充（vanilla ES modules，無 build step）
    manifest.json
    vendor/xlsx.full.min.js  SheetJS（匯出 Excel）
    src/
      shared/                純函式與型別，extension 內所有 context 共用
        contract.js          訊息型別、enum、工廠函式、JSDoc typedef（本文件的程式版）
        storage.js           chrome.storage 封裝（schema、預設值、migration）
        brands.js            品牌人設預設（presets）、預設品牌
        pricing.js           定價引擎
        compliance.js        禁用詞、預購規則、材質聲明政策
        shopee-template.js   蝦皮批量上傳範本欄位對應 + 簡易表
        image-url.js         CDN 縮圖網址 → 高清網址正規化
        prompt.js            BYOK 模式的 prompt 組裝 + 模型輸出 → 文案組版
      background/
        service-worker.js    訊息路由、port 廣播、job store
        pipeline.js          extract → generate → ready 的狀態機
        gemini.js            BYOK：直接呼叫 Gemini（多模態、JSON mode、模型 fallback）
        api.js               Cloud 模式：呼叫 Listio 後端
      content/
        index.js             依網址挑 adapter、回傳 Product
        adapters/base.js     Adapter 介面 + 共用 DOM helpers
        adapters/taobao.js   adapters/tmall.js   adapters/alibaba1688.js
      sidepanel/
        index.html app.js    Side Panel 主 UI（擷取 → 審稿 → 匯出）
        runtime.js           chrome runtime 與 mock runtime 的抽象（UI 可離線開發／截圖）
        views/*.js components.js
        cover/renderer.js    Canvas 2D 首圖渲染（純函式）
        cover/templates.js   首圖模板定義（4 款）
      options/               品牌／人設／模板／定價／連線與方案
      styles/                tokens.css base.css components.css sidepanel.css options.css
  server/                    Node 20 + Hono，Cloud Run；Postgres；Stripe／綠界 webhooks
  tests/                     node --test 可直接跑的純函式測試
  docs/                      設計文件
```

## 1. 執行環境與硬性規則

- Chrome ≥ 116（Side Panel API）。`manifest_version: 3`，service worker 為 ES module。
- 不用框架、不用 bundler；瀏覽器端只用原生 ES modules。可讀性優先。
- 所有使用者可見文字為繁體中文（台灣用語）。
- `chrome.*` 只允許出現在 `background/`、`content/index.js`、`sidepanel/runtime.js`、`options/options.js`；`shared/` 與 `cover/` 必須是純函式（可在 node 測試）。
- 不得把 API key 寫進程式；BYOK 模式 key 存在 `chrome.storage.local`。

## 2. 資料模型（JSDoc 也在 `shared/contract.js`）

```ts
type Site = 'taobao' | 'tmall' | '1688';

interface ProductImage { url: string; hiRes: string; width?: number; height?: number }

interface Product {
  site: Site;
  url: string;
  itemId: string | null;
  title: string;
  images: ProductImage[];          // 去重、已正規化、依出現順序
  price: { amount: number; currency: 'CNY' } | null;
  attrs: Record<string, string>;   // 例如 {材質:'合金', 風格:'韓系'}
  skus: { name: string; options: string[] }[];
  shopName: string | null;
  extractor: { adapter: string; strategy: 'state' | 'jsonld' | 'dom' | 'fallback'; warnings: string[] };
}

type JobStatus = 'extracting' | 'generating' | 'ready' | 'error';

interface PriceDraft {
  costCny: number | null; rate: number; shippingTwd: number; feeRate: number; marginRate: number;
  rounding: '9' | '0' | 'none'; suggested: number | null; final: number | null;
}

interface Draft {
  title: string;                   // ≤ 60 字（蝦皮上限）
  description: string;             // 已組版完成的描述全文
  tags: string[];
  selectedImages: number[];        // Product.images 的索引，順序即匯出順序，≤ 9
  coverImageIndex: number;         // 用哪張圖做首圖
  coverTemplateId: string;
  coverDataUrl: string | null;     // 由 side panel 渲染後回寫
  price: PriceDraft;
  daysToShip: number;              // >2 即預購
  categoryId: string;              // 蝦皮分類代碼（使用者填）
  stock: number;
  weightKg: number;
}

interface Generated {               // 模型結構化輸出（見 §5）
  title: string; slogan: string; body: string; signature: string;
  details: { label: string; value: string }[];
  tags: string[]; style: string; materialHints: string[]; warnings: string[];
}

interface ComplianceIssue { level: 'info' | 'warn' | 'block'; field: 'title' | 'description' | 'price' | 'images' | 'general'; message: string; fix?: string }

interface Job {
  id: string; createdAt: number; updatedAt: number;
  status: JobStatus; progress: { step: 'extract' | 'generate' | 'compose'; label: string };
  error: { code: ErrCode; message: string; hint?: string } | null;
  tabId: number | null;
  brandId: string;
  product: Product | null;
  generated: Generated | null;
  draft: Draft | null;             // 另含 editedFields?: { title?, description? }（手改標記）與 coverThumb?: string（120px 首圖縮圖，列表用）
  compliance: ComplianceIssue[];
  exportedAt: number | null;       // 最近一次交付時間（帶入蝦皮／匯出 Excel／複製圖文）
  exportedVia: 'shopee' | 'xlsx' | 'clipboard' | null;
}

interface Persona {
  presetId: 'warm' | 'minimal' | 'playful' | 'luxury' | 'custom';
  tone: string;                    // 一句話描述語氣
  styleTags: string[];             // 允許出現在標題的風格標籤池
  signatureTitle: string;          // 例：'🐈 Mimi 碎碎唸'
  signatureHint: string;           // 給模型：這段要寫什麼
  emoji: boolean;
  customPrompt: string;            // presetId==='custom' 時追加
}

interface Brand {
  id: string; name: string; badgeText: string; tagline: string;
  persona: Persona;
  shippingNote: string;            // 固定附在描述尾端
  palette: { bg: string; fg: string; accent: string };
  coverTemplateId: string;
  pricing: { rate: number; shippingTwd: number; feeRate: number; marginRate: number; rounding: '9' | '0' | 'none' };
  materialClaims: { silver925: boolean; gold18k: boolean; steel316: boolean; natural: boolean };  // 使用者宣告，模型不得自行推斷
  defaults: { daysToShip: number; stock: number; weightKg: number; categoryId: string };
}

interface Settings {
  mode: 'byok' | 'cloud';          // 預設 'cloud'：安裝即可用免費方案，不需註冊、不需金鑰；'byok' 為進階選項（自備金鑰，不計件數）
  geminiApiKey: string;            // byok
  model: string;                   // byok，預設 'gemini-3-flash-preview'，fallback 'gemini-2.5-flash'
  backendUrl: string;              // cloud，預設 'https://api.listio.app'
  authToken: string;               // cloud：由 POST /v1/auth/anonymous 自動核發的匿名 JWT（使用者不需登入）
  deviceId: string;                // cloud：本機產生的 UUID v4，用來換取／續期匿名 token
  gasUrl: string;                  // 選用：Google Apps Script 同步
  activeBrandId: string;
  telemetry: boolean;
  onboarded: boolean;
}

// 免費方案 = 終身 10 件（不隨月份重置）；Pro / Studio = 每月額度（UTC 月初重置）。
// PLAN_LIMITS = { free: 10, pro: 150, studio: 600 }；PLAN_PERIOD = { free: 'lifetime', pro: 'monthly', studio: 'monthly' }
interface Usage {
  plan: 'free' | 'pro' | 'studio';
  used: number;                    // free：終身累計；pro/studio：本月
  limit: number;
  period: 'lifetime' | 'monthly';
  periodEnd: number | null;        // monthly 才有值
}

type ErrCode = 'UNSUPPORTED_PAGE' | 'EXTRACT_EMPTY' | 'NO_API_KEY' | 'UNAUTHENTICATED' | 'QUOTA_EXCEEDED'
             | 'MODEL_ERROR' | 'NETWORK' | 'IMAGE_FETCH' | 'INTERNAL';
```

## 3. 擴充內部訊息協定

全部透過 `chrome.runtime.sendMessage({ type, ...payload })` 請求／回應；回應一律 `{ ok: true, data } | { ok: false, error: { code, message, hint? } }`。
狀態推播透過 `chrome.runtime.connect({ name: 'listio-ui' })` 的 port，service worker 對所有已連線 port 廣播。

| type | payload | data |
|---|---|---|
| `page/probe` | `{ tabId? }` | `{ supported: boolean, site: Site\|null, url, title }` |
| `job/start` | `{ tabId?, brandId? }` | `Job` |
| `job/get` | `{ jobId }` | `Job` |
| `job/list` | `{ limit? }` | `Job[]`（新到舊） |
| `job/update` | `{ jobId, draftPatch: Partial<Draft>, silent?: boolean }` | `Job`（會重跑 compliance 與定價；`silent` 用於縮圖等快取更新：不推播、不改排序） |
| `job/regenerate` | `{ jobId, field: 'all'\|'title'\|'description', toneOverride?: string }` | `Job`（只覆蓋指定欄位，並清除該欄位的 `editedFields` 標記） |
| `job/markExported` | `{ jobId, via: 'shopee'\|'xlsx'\|'clipboard' }` | `Job`（寫入 `exportedAt / exportedVia` 並推播） |
| `job/delete` | `{ jobId }` | `{ deleted: true }` |
| `settings/get` | — | `Settings`（apiKey 會被遮罩成 `sk…1234`，除非 `{ reveal: true }`） |
| `settings/set` | `{ patch: Partial<Settings> }` | `Settings` |
| `settings/testKey` | `{ apiKey?, model? }` | `{ ok: true, model }` |
| `brand/list` | — | `Brand[]` |
| `brand/save` | `{ brand: Brand }` | `Brand` |
| `brand/delete` | `{ brandId }` | `{ deleted: true }` |
| `usage/get` | — | `Usage` |
| `export/shopeeAutofill` | `{ jobId, coverDataUrl? }` | `{ tabId, imagesCount, filled: { title, description, price, stock, sku: boolean, uploadedImages: number } \| null }`（UI 依 `filled` 決定顯示成功或「哪些欄位要手動補」並自動複製文字備援） |
| `export/sheet` | `{ jobId }` | `{ synced: true }` |
| `telemetry/event` | `{ name, props? }` | `{ ok: true }` |

Port 廣播：`{ type: 'job/changed', job: Job }`、`{ type: 'usage/changed', usage: Usage }`、`{ type: 'settings/changed', settings }`、`{ type: 'page/changed', page: { supported, site, url, title } }`（使用者切換分頁或頁面載入完成時）。

## 4. Content adapter 介面（`content/adapters/base.js`）

```js
export const adapter = {
  id: 'taobao',                                  // 'taobao' | 'tmall' | '1688'
  match(url) { return boolean },                 // 是否為此站商品頁
  extract(document, location) { return Product } // 同步；不得丟例外，失敗回傳 images=[] 並在 extractor.warnings 說明
};
```

策略順序：`state`（頁面全域狀態，如 `window.__INITIAL_DATA__`／script JSON）→ `jsonld` → `dom`（縮圖列表）→ `fallback`（全頁 img 白名單）。
圖片一律經 `image-url.js` 的 `toHiRes(url)` 與 `dedupe(images)`。

`content/index.js` 在被 `chrome.scripting.executeScript({ files: ['src/content/index.js'] })` 注入時，最後一個表達式回傳 `Product`（或 `{ error: { code, message } }`）。

## 5. 生成 API（BYOK 與 Cloud 共用同一個 request/response，Cloud 多一層 auth 與計量）

`POST {backendUrl}/v1/generate`  `Authorization: Bearer <jwt>`

```jsonc
// request
{
  "brand":   { "name", "persona": Persona, "shippingNote", "materialClaims" },
  "product": { "site", "title", "attrs", "skus", "price" },
  "image":   { "mimeType": "image/jpeg", "dataBase64": "..." } | null,   // 主圖，≤ 1MB
  "options": { "field": "all" | "title" | "description", "toneOverride": null, "platform": "shopee", "locale": "zh-TW" }
}
// 200
{ "generated": Generated, "usage": Usage, "model": "gemini-…" }
// 401 { "error": { "code": "UNAUTHENTICATED" } }
// 402 { "error": { "code": "QUOTA_EXCEEDED", "message", "upgradeUrl" } }
// 422 { "error": { "code": "INVALID_REQUEST", "message" } }
// 502 { "error": { "code": "MODEL_ERROR", "message" } }
```

模型輸出 JSON schema（兩種模式都用 Gemini `responseMimeType: application/json` + `responseSchema`）：

```json
{
  "type": "object",
  "properties": {
    "title":   { "type": "string", "description": "≤60 字，關鍵字前置，含 1 個風格標籤，不含年份與『新款』" },
    "slogan":  { "type": "string", "description": "一句詩意 slogan，≤ 30 字" },
    "body":    { "type": "string", "description": "2–3 段描述與穿搭／使用情境，繁體中文" },
    "signature": { "type": "string", "description": "品牌招牌段落內容（第一人稱、口語）" },
    "details": { "type": "array", "items": { "type": "object", "properties": { "label": {"type":"string"}, "value": {"type":"string"} }, "required": ["label","value"] } },
    "tags":    { "type": "array", "items": { "type": "string" }, "description": "5–8 個蝦皮搜尋關鍵字" },
    "style":   { "type": "string", "description": "從 styleTags 選一個" },
    "materialHints": { "type": "array", "items": { "type": "string" }, "description": "從圖片／標題『觀察到』的材質線索，不是斷言" },
    "warnings": { "type": "array", "items": { "type": "string" } }
  },
  "required": ["title", "slogan", "body", "signature", "details", "tags", "style", "materialHints", "warnings"]
}
```

**材質政策**：模型只能回報 `materialHints`；「925純銀」「18K金」等**聲明**只在 `brand.materialClaims` 為 true 時由 `prompt.js` 的組版步驟加入，否則 `compliance.js` 會把模型偷放的聲明標成 `block` 並自動移除。

其他後端端點：`GET /v1/me` → `{ user, plan, usage }`；`GET /v1/usage` → `Usage`；`POST /v1/telemetry` → 204；`POST /v1/billing/checkout` → `{ url }`；`POST /v1/billing/portal` → `{ url }`；`POST /v1/webhooks/stripe`；`POST /v1/webhooks/ecpay`；`GET /v1/health`。

**匿名裝置帳號（免費方案不需註冊）**：`POST /v1/auth/anonymous`（不需 Bearer，依 IP 限流）

```jsonc
// request
{ "deviceId": "<UUID v4，由擴充功能在本機產生並存於 Settings.deviceId>" }
// 200
{ "token": "<HS256 JWT，sub = UUID v5(deviceId)，anon = true，有效 1 年>", "user": { "id", "anonymous": true }, "usage": Usage }
// 422 { "error": { "code": "INVALID_REQUEST" } }
```

- 同一個 `deviceId` 永遠對應同一個 userId（UUID v5，見 `server/src/lib/anon.js`），所以 token 過期後重新換發不會重置免費額度。
- service worker 在第一次雲端生成或查詢用量時自動呼叫；UI 不需要任何登入步驟。
- 升級付費方案時再以 email（Supabase）登入並綁定匿名帳號；綁定流程不在本版範圍。

## 6. 首圖渲染介面（`sidepanel/cover/renderer.js`）

```js
/** 純函式：在任何 CanvasRenderingContext2D（含 OffscreenCanvas）上畫 1 張 size×size 首圖 */
export async function drawCover(ctx, {
  size,                 // 預設 800
  template,             // templates.js 中的一個物件
  brand,                // Brand（用 name / badgeText / tagline / palette）
  image,                // CanvasImageSource（已載入的 ImageBitmap 或 HTMLImageElement）
  title,                // 要顯示的標題（renderer 自行截斷／換行）
  watermark             // boolean（Free 方案為 true，右下角小字 'Listio'）
});
export function fitText(ctx, text, maxWidth, maxLines) → string[]   // 中英混排換行
```

`templates.js` 匯出 `TEMPLATES: { id, name, description, layout, preview?: fn }[]`，至少 4 款：`badge-classic`、`editorial`、`polaroid`、`bold`。模板只描述排版參數（區塊位置、字級、是否有徽章），顏色由 `brand.palette` 決定。

## 7. 定價引擎（`shared/pricing.js`）

```
suggested = ceil( (costCny × rate + shippingTwd) / (1 − feeRate − marginRate) )
rounding '9' → 進位到個位數為 9（例：283 → 289）； '0' → 進位到十位；'none' → 不處理
```
`computePrice(priceDraft) → PriceDraft`（填入 `suggested`，`final` 若為 null 則等於 suggested）
`explainPrice(priceDraft) → { lines: [{ label, value }] }` 供 UI 顯示公式拆解。

## 8. 匯出（`shared/shopee-template.js`）

- `SHOPEE_TW_MASS_UPLOAD`：欄位定義陣列 `{ key, header, required, example, from: (job) => value }`，產生官方範本結構（第 1–5 列說明、第 6 列起資料）。**欄位名稱需與賣家中心當期下載的範本校對**，所以用資料驅動，改陣列即可。
- `SIMPLE_SHEET`：舊版 7 欄（商品名稱／商品描述／商品圖片 1–5）＋ 價格、預購、出貨天數。
- `buildWorkbookRows(preset, jobs) → string[][]`，由 UI 層用 SheetJS 寫檔（shared 不碰 SheetJS）。

## 9. 錯誤與復原原則

- 任何步驟失敗，Job 進入 `error`，保留已取得的資料（例：抓圖成功、生成失敗 → 使用者仍可手寫文案與匯出）。
- `EXTRACT_EMPTY` 的 hint 必須提供「回報頁面」動作（送 `telemetry/event` name=`selector_miss`，附 site 與 adapter strategy，不附 URL 以外的個資）。
- UI 永遠可以手動輸入／貼上標題與圖片網址作為最後手段。
