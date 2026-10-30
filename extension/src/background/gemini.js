// BYOK 模式：直接呼叫 Gemini API（多模態、JSON mode、模型 fallback、簡單重試）。
import { ListioError, GENERATED_SCHEMA, FALLBACK_MODELS } from '../shared/contract.js';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * @param {{apiKey:string, model:string, systemInstruction:string, parts:any[], temperature?:number, signal?:AbortSignal}} req
 * @returns {Promise<{raw:any, model:string, usageMetadata:any}>}
 */
export async function generateWithGemini(req) {
  if (!req.apiKey) throw new ListioError('NO_API_KEY', '尚未設定 Gemini API Key');
  const candidates = [req.model, ...FALLBACK_MODELS.filter((m) => m !== req.model)];
  let lastError = null;

  for (const model of candidates) {
    try {
      return await callOnce(model, req);
    } catch (err) {
      lastError = err;
      // 模型不存在或已下架 → 換下一個；其他錯誤直接丟出。
      if (!(err instanceof ListioError && err.code === 'MODEL_ERROR' && err.retryWithNextModel)) throw err;
    }
  }
  throw lastError || new ListioError('MODEL_ERROR', 'AI 沒有回應');
}

async function callOnce(model, req, attempt = 0) {
  const body = {
    systemInstruction: { parts: [{ text: req.systemInstruction }] },
    contents: [{ role: 'user', parts: req.parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: GENERATED_SCHEMA,
      temperature: req.temperature ?? 0.8,
    },
  };

  let res;
  try {
    res = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': req.apiKey },
      body: JSON.stringify(body),
      signal: req.signal,
    });
  } catch (err) {
    throw new ListioError('NETWORK', `連線 Gemini 失敗：${err.message}`);
  }

  if (res.status === 404 || res.status === 400) {
    const text = await safeText(res);
    const notFound = res.status === 404 || /not found|not supported|unsupported model/i.test(text);
    if (notFound) {
      const e = new ListioError('MODEL_ERROR', `模型 ${model} 不可用`, '已嘗試切換到備用模型。');
      e.retryWithNextModel = true;
      throw e;
    }
    if (/API key/i.test(text)) throw new ListioError('NO_API_KEY', 'Gemini API Key 無效', '請到設定重新貼上。');
    throw new ListioError('MODEL_ERROR', `Gemini 回應 400：${text.slice(0, 200)}`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new ListioError('NO_API_KEY', 'Gemini API Key 無效或沒有權限', '請到設定重新貼上。');
  }
  if ((res.status === 429 || res.status >= 500) && attempt < 1) {
    await sleep(800 + Math.random() * 700);
    return callOnce(model, req, attempt + 1);
  }
  if (!res.ok) {
    throw new ListioError('MODEL_ERROR', `Gemini 回應 ${res.status}：${(await safeText(res)).slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  const raw = parseJsonLoose(text);
  if (!raw) {
    const reason = data?.candidates?.[0]?.finishReason || data?.promptFeedback?.blockReason;
    throw new ListioError('MODEL_ERROR', `AI 回傳的內容無法解析${reason ? `（${reason}）` : ''}`, '再試一次通常就會好。');
  }
  return { raw, model, usageMetadata: data.usageMetadata || null };
}

/** 驗證 API key：列出模型，順便確認指定模型存在。 */
export async function testApiKey(apiKey, model) {
  if (!apiKey) throw new ListioError('NO_API_KEY', '請先貼上 API Key');
  let res;
  try {
    res = await fetch(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
  } catch (err) {
    throw new ListioError('NETWORK', `連線失敗：${err.message}`);
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    throw new ListioError('NO_API_KEY', 'API Key 無效', '到 https://aistudio.google.com/apikey 重新建立。');
  }
  if (!res.ok) throw new ListioError('MODEL_ERROR', `Gemini 回應 ${res.status}`);
  const data = await res.json();
  const names = (data.models || []).map((m) => m.name.replace(/^models\//, ''));
  const available = names.includes(model) ? model : names.find((n) => FALLBACK_MODELS.includes(n)) || names[0];
  return { ok: true, model: available, requestedAvailable: names.includes(model) };
}

function parseJsonLoose(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

async function safeText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
