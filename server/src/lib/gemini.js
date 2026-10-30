// 後端呼叫 Gemini REST API（支援 JSON Schema、模型 fallback 與重試）
import { GENERATED_SCHEMA } from '../shared/contract.js';
import { ApiError } from './errors.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

export async function generate({
  model,
  fallbackModels = [],
  apiKey,
  systemInstruction,
  contents,
  schema = GENERATED_SCHEMA,
  timeoutMs = 25000,
}) {
  if (!apiKey) throw new ApiError(502, 'MODEL_ERROR', '伺服器尚未設定 GEMINI_API_KEY');
  const candidates = [model, ...fallbackModels.filter((m) => m !== model)].filter(Boolean);
  let lastErr = null;

  for (const m of candidates) {
    try {
      return await callGeminiOnce({ model: m, apiKey, systemInstruction, contents, schema, timeoutMs });
    } catch (err) {
      lastErr = err;
      if (!err?.retryNextModel) throw err;
    }
  }
  throw lastErr || new ApiError(502, 'MODEL_ERROR', 'AI 暫時沒有回應');
}

async function callGeminiOnce(req, attempt = 0) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), req.timeoutMs);

  let res;
  try {
    res = await fetch(`${BASE}/models/${encodeURIComponent(req.model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': req.apiKey,
      },
      body: JSON.stringify({
        systemInstruction: req.systemInstruction,
        contents: req.contents,
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: req.schema,
          temperature: 0.8,
        },
      }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    throw new ApiError(502, 'MODEL_ERROR', `連線 Gemini 失敗：${err.message}`);
  }
  clearTimeout(timer);

  if (res.status === 404 || res.status === 400) {
    const bodyText = await res.text().catch(() => '');
    if (res.status === 404 || /not found|not supported/i.test(bodyText)) {
      const e = new ApiError(502, 'MODEL_ERROR', `模型 ${req.model} 不可用`);
      e.retryNextModel = true;
      throw e;
    }
    throw new ApiError(502, 'MODEL_ERROR', `Gemini 回應 400：${bodyText.slice(0, 160)}`);
  }

  if ((res.status === 429 || res.status >= 500) && attempt < 1) {
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 500));
    return callGeminiOnce(req, attempt + 1);
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '');
    throw new ApiError(502, 'MODEL_ERROR', `Gemini 回應 ${res.status}：${bodyText.slice(0, 160)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  let generated;
  try {
    generated = JSON.parse(text);
  } catch {
    throw new ApiError(502, 'MODEL_ERROR', 'AI 回傳的 JSON 無法解析');
  }

  return {
    generated,
    model: req.model,
    usageMetadata: data.usageMetadata || null,
  };
}
