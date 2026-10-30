// POST /v1/generate：驗證輸入、檢查額度、呼叫 Gemini、成功後於交易內扣點並回傳。
import { Hono } from 'hono';
import { SHOPEE_TITLE_MAX } from '../shared/contract.js';
import { config } from '../config.js';
import { getPool, withTx } from '../lib/db.js';
import { invalidRequest } from '../lib/errors.js';
import { getUsage, consume, rateLimit } from '../lib/metering.js';
import { buildGeminiRequest } from '../lib/prompts.js';
import { generate } from '../lib/gemini.js';

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BASE64_LEN = Math.ceil((1024 * 1024 * 4) / 3) + 128; // ~1MB binary

export const generateRoutes = new Hono();

generateRoutes.post('/', rateLimit({ perMinute: 20 }), async (c) => {
  const user = c.get('user');
  const body = await c.req.json().catch(() => null);
  if (!body || typeof body !== 'object') throw invalidRequest('Request body 必須為 JSON 物件');

  const { brand, product, image = null, options = {} } = body;
  if (!brand?.name) throw invalidRequest('缺少 brand.name');
  if (!product?.title) throw invalidRequest('缺少 product.title');

  if (image != null) {
    if (!ALLOWED_MIMES.has(image.mimeType)) {
      throw invalidRequest('image.mimeType 僅支援 image/jpeg、image/png、image/webp');
    }
    if (typeof image.dataBase64 !== 'string' || image.dataBase64.length > MAX_BASE64_LEN) {
      throw invalidRequest('圖片大小超過 1MB 上限');
    }
  }

  // 1. 先檢查額度是否足夠（尚未扣點，若 AI 失敗不扣用戶額度）
  const upgradeUrl = `${config.appBaseUrl}/upgrade`;
  const preUsage = await getUsage(getPool(), user.id);
  if (preUsage.used >= preUsage.limit) {
    await consume(getPool(), user.id, { upgradeUrl }); // 觸發標準 402 QUOTA_EXCEEDED
  }

  // 2. 組裝 Prompt 並呼叫 Gemini
  const startedAt = Date.now();
  const geminiReq = buildGeminiRequest(brand, product, image, options);
  const { generated, model, usageMetadata } = await generate({
    model: config.geminiModel,
    fallbackModels: config.geminiFallbackModels,
    apiKey: config.geminiApiKey,
    systemInstruction: geminiReq.systemInstruction,
    contents: geminiReq.contents,
  });

  // 3. 後處理：標題長度與標籤去重
  if (typeof generated.title === 'string' && generated.title.length > SHOPEE_TITLE_MAX) {
    generated.title = generated.title.slice(0, SHOPEE_TITLE_MAX).trim();
  }
  if (Array.isArray(generated.tags)) {
    generated.tags = [...new Set(generated.tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 8);
  }

  // 4. 在交易內扣除額度並寫入匿名化的生成紀錄（不存商品標題與文案）
  const latencyMs = Date.now() - startedAt;
  const usage = await withTx(async (tx) => {
    const nextUsage = await consume(tx, user.id, { upgradeUrl });
    await tx.query(
      `INSERT INTO generations (user_id, brand_name, site, model, input_tokens, output_tokens, latency_ms, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'ok')`,
      [
        user.id,
        String(brand.name).slice(0, 64),
        String(product.site || 'unknown'),
        model,
        usageMetadata?.promptTokenCount || null,
        usageMetadata?.candidatesTokenCount || null,
        latencyMs,
      ],
    );
    return nextUsage;
  });

  return c.json({ generated, usage, model });
});
