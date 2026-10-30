// Listio service worker：訊息路由、port 廣播、chrome.* 的唯一出口（連同 content/index.js 與 UI runtime）。
import { MSG, UI_PORT_NAME, ok, fail, ListioError, ERROR_COPY } from '../shared/contract.js';
import { createStore, chromeBackend } from '../shared/storage.js';
import { probe as probeUrl } from '../content/index.js';
import { createPipeline } from './pipeline.js';
import { generateWithGemini, testApiKey } from './gemini.js';
import { generateViaBackend, fetchUsage, postTelemetry, createAnonymousSession } from './api.js';

const store = createStore(chromeBackend(chrome.storage.local));
const ports = new Set();
const ready = store.init();

const TELEMETRY_ALLOWLIST = new Set([
  'capture_ok', 'selector_miss', 'generate_ok', 'generate_fail', 'export_xlsx', 'export_clipboard',
  'cover_download', 'sheet_sync', 'shopee_autofill', 'onboarding_done', 'upgrade_click',
]);

// ---------- 安裝 / 啟動 ----------
chrome.runtime.onInstalled.addListener(async () => {
  await ready;
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

// ---------- UI port：狀態推播 ----------
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== UI_PORT_NAME) return;
  ports.add(port);
  port.onDisconnect.addListener(() => ports.delete(port));
});

function broadcast(message) {
  for (const port of ports) {
    try {
      port.postMessage(message);
    } catch {
      ports.delete(port);
    }
  }
}

// 分頁切換／載入完成 → 通知 side panel 重新偵測頁面
chrome.tabs.onActivated.addListener(({ tabId }) => notifyPage(tabId));
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'complete' || info.url) notifyPage(tabId);
});

async function notifyPage(tabId) {
  if (!ports.size) return;
  const page = await probeTab(tabId).catch(() => null);
  if (page) broadcast({ type: MSG.PAGE_CHANGED, page });
}

// ---------- 擷取：在分頁裡動態 import content/index.js ----------
async function extractFromTab(tabId) {
  if (tabId == null) throw new ListioError('UNSUPPORTED_PAGE', ERROR_COPY.UNSUPPORTED_PAGE.message, ERROR_COPY.UNSUPPORTED_PAGE.hint);
  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId },
      func: async () => {
        const mod = await import(chrome.runtime.getURL('src/content/index.js'));
        return mod.runExtract(document, location, window);
      },
    });
  } catch (err) {
    // 沒有 host permission 或分頁無法注入（chrome://、PDF…）
    throw new ListioError('UNSUPPORTED_PAGE', ERROR_COPY.UNSUPPORTED_PAGE.message, `${ERROR_COPY.UNSUPPORTED_PAGE.hint}（${err.message}）`);
  }
  return results?.[0]?.result ?? null;
}

async function probeTab(tabId) {
  const tab = tabId != null ? await chrome.tabs.get(tabId) : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (!tab?.url) return { supported: false, site: null, url: '', title: '', tabId: tab?.id ?? null };
  const { supported, site } = probeUrl(tab.url);
  return { supported, site, url: tab.url, title: tab.title || '', tabId: tab.id };
}

// ---------- 圖片 → base64（給多模態用） ----------
async function fetchImageBase64(url) {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new ListioError('IMAGE_FETCH', `圖片下載失敗（${res.status}）`);
  const blob = await res.blob();
  const buf = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < buf.length; i += 0x8000) binary += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  const mimeType = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
  return { mimeType, dataBase64: btoa(binary), bytes: buf.length };
}

// ---------- 生成：BYOK 或 Cloud ----------
let sessionBootstrap = null;

/**
 * 雲端模式不需註冊：第一次呼叫時用本機裝置識別碼向後端換一組匿名 token（免費 10 件綁在這個裝置上）。
 * 同時只跑一次，避免 side panel 與 options 同時觸發時重複建立帳號。
 */
async function ensureCloudSession(settings) {
  if (settings.mode !== 'cloud' || settings.authToken) return settings;
  if (!sessionBootstrap) {
    sessionBootstrap = (async () => {
      const deviceId = settings.deviceId || crypto.randomUUID();
      let session;
      try {
        session = await createAnonymousSession(settings.backendUrl, deviceId);
      } catch (err) {
        // 後端連不上（離線、尚未部署、被防火牆擋）：用使用者看得懂的話，並指出可以改用自備金鑰
        throw new ListioError('UNAUTHENTICATED', ERROR_COPY.UNAUTHENTICATED.message, `${ERROR_COPY.UNAUTHENTICATED.hint}（${err?.message || err}）`);
      }
      if (session.usage) await store.setUsage(session.usage);
      const next = await store.setSettings({ authToken: session.token, deviceId });
      broadcast({ type: MSG.SETTINGS_CHANGED, settings: maskSettings(next) });
      return next;
    })().finally(() => {
      sessionBootstrap = null;
    });
  }
  return sessionBootstrap;
}

async function generate(req, settings) {
  if (settings.mode === 'cloud') {
    const s = await ensureCloudSession(settings);
    const { byok, ...body } = req;
    return generateViaBackend({ backendUrl: s.backendUrl, authToken: s.authToken }, body);
  }
  if (!settings.geminiApiKey) {
    throw new ListioError('NO_API_KEY', ERROR_COPY.NO_API_KEY.message, ERROR_COPY.NO_API_KEY.hint);
  }
  const { raw, model } = await generateWithGemini({
    apiKey: settings.geminiApiKey,
    model: settings.model,
    systemInstruction: req.byok.systemInstruction,
    parts: req.byok.parts,
  });
  return { generated: raw, model };
}

function track(name, props = {}) {
  if (!TELEMETRY_ALLOWLIST.has(name)) return;
  store.getSettings().then((s) => {
    if (!s.telemetry || s.mode !== 'cloud' || !s.authToken) return;
    postTelemetry({ backendUrl: s.backendUrl, authToken: s.authToken }, name, props);
  });
}

const pipeline = createPipeline({
  store,
  extract: extractFromTab,
  fetchImage: fetchImageBase64,
  generate,
  emit: (job) => broadcast({ type: MSG.JOB_CHANGED, job }),
  track,
});

// ---------- 訊息路由 ----------
const handlers = {
  [MSG.PAGE_PROBE]: ({ tabId }) => probeTab(tabId),

  [MSG.JOB_START]: async ({ tabId, brandId }) => {
    const page = await probeTab(tabId);
    if (!page.supported) throw new ListioError('UNSUPPORTED_PAGE', ERROR_COPY.UNSUPPORTED_PAGE.message, ERROR_COPY.UNSUPPORTED_PAGE.hint);
    return pipeline.start({ tabId: page.tabId, brandId });
  },
  [MSG.JOB_GET]: async ({ jobId }) => (await store.getJob(jobId)) || Promise.reject(new ListioError('INTERNAL', '找不到這筆工作')),
  [MSG.JOB_LIST]: ({ limit }) => store.listJobs(limit),
  [MSG.JOB_UPDATE]: ({ jobId, draftPatch, silent }) => pipeline.update(jobId, draftPatch || {}, { silent: Boolean(silent) }),
  [MSG.JOB_REGENERATE]: ({ jobId, field, toneOverride }) => pipeline.regenerate(jobId, field, toneOverride),
  [MSG.JOB_MARK_EXPORTED]: ({ jobId, via }) => pipeline.markExported(jobId, via),
  [MSG.JOB_DELETE]: async ({ jobId }) => {
    await store.deleteJob(jobId);
    return { deleted: true };
  },

  [MSG.SETTINGS_GET]: async ({ reveal } = {}) => maskSettings(await store.getSettings(), reveal),
  [MSG.SETTINGS_SET]: async ({ patch }) => {
    const clean = { ...(patch || {}) };
    // UI 可能把遮罩過的 key 原樣送回來；遮罩值一律忽略，避免蓋掉真正的 key。
    if (typeof clean.geminiApiKey === 'string' && clean.geminiApiKey.includes('…')) delete clean.geminiApiKey;
    delete clean.geminiApiKeyMasked;
    const settings = await store.setSettings(clean);
    broadcast({ type: MSG.SETTINGS_CHANGED, settings: maskSettings(settings) });
    return maskSettings(settings);
  },
  [MSG.SETTINGS_TEST_KEY]: async ({ apiKey, model }) => {
    const s = await store.getSettings();
    return testApiKey(apiKey || s.geminiApiKey, model || s.model);
  },

  [MSG.BRAND_LIST]: () => store.listBrands(),
  [MSG.BRAND_SAVE]: ({ brand }) => store.saveBrand(brand),
  [MSG.BRAND_DELETE]: async ({ brandId }) => {
    await store.deleteBrand(brandId);
    return { deleted: true };
  },

  [MSG.USAGE_GET]: async () => {
    const s = await store.getSettings();
    if (s.mode === 'cloud') {
      try {
        const session = await ensureCloudSession(s);
        const usage = await fetchUsage({ backendUrl: session.backendUrl, authToken: session.authToken });
        await store.setUsage(usage);
        return usage;
      } catch {
        // 離線或後端暫時不可用時用快取
      }
    }
    return store.getUsage();
  },

  [MSG.EXPORT_SHEET]: async ({ jobId }) => {
    const [job, s] = await Promise.all([store.getJob(jobId), store.getSettings()]);
    if (!s.gasUrl) throw new ListioError('INTERNAL', '尚未設定 Google Apps Script 網址', '到設定 → 連線與方案填入。');
    if (!job?.draft) throw new ListioError('INTERNAL', '找不到這筆工作');
    const payload = {
      title: job.draft.title,
      description: job.draft.description,
      images: job.draft.selectedImages.map((i) => job.product.images[i]?.hiRes).filter(Boolean),
      price: job.draft.price.final,
      sourceUrl: job.product.url,
      tags: job.draft.tags,
    };
    let res;
    try {
      // text/plain 避免 CORS preflight（GAS 不回 OPTIONS）
      res = await fetch(s.gasUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload), redirect: 'follow' });
    } catch (err) {
      throw new ListioError('NETWORK', `連線 Google Apps Script 失敗：${err.message}`);
    }
    if (!res.ok) throw new ListioError('NETWORK', `Apps Script 回應 ${res.status}`, '確認部署為「任何人」可存取的網頁應用程式。');
    track('sheet_sync');
    return { synced: true };
  },

  [MSG.EXPORT_SHOPEE_AUTOFILL]: async ({ jobId, coverDataUrl }) => {
    const job = await store.getJob(jobId);
    if (!job?.draft) throw new ListioError('INTERNAL', '找不到這筆商品紀錄');

    const images = [];
    if (coverDataUrl) {
      images.push({ filename: '01_品牌首圖.png', mimeType: 'image/png', dataUrl: coverDataUrl });
    }
    const prodImgs = job.product?.images || [];
    const selectedIndices = job.draft.selectedImages || [];
    for (const idx of selectedIndices) {
      if (images.length >= 9) break;
      // 若已有合成品牌首圖，跳過與首圖底圖重複的那張原圖，保留更多不同角度細節圖
      if (coverDataUrl && idx === job.draft.coverImageIndex) continue;
      const srcUrl = prodImgs[idx]?.hiRes || prodImgs[idx]?.url;
      if (!srcUrl) continue;
      if (srcUrl.startsWith('data:')) {
        images.push({ filename: `0${images.length + 1}_商品圖.jpg`, mimeType: 'image/jpeg', dataUrl: srcUrl });
        continue;
      }
      try {
        const fetched = await fetchImageBase64(srcUrl);
        images.push({
          filename: `0${images.length + 1}_商品圖.jpg`,
          mimeType: fetched.mimeType,
          dataUrl: `data:${fetched.mimeType};base64,${fetched.dataBase64}`,
        });
      } catch {
        // 單張圖片抓取失敗時不阻斷整體上架流程
      }
    }

    const autofillPayload = {
      title: job.draft.title,
      description: job.draft.description,
      price: job.draft.price.final,
      stock: job.draft.stock ?? 20,
      daysToShip: job.draft.daysToShip ?? 10,
      parentSku: job.product?.itemId ? `${job.product.site.toUpperCase()}-${job.product.itemId}` : '',
      images,
    };

    const tab = await chrome.tabs.create({ url: 'https://seller.shopee.tw/portal/product/new', active: true });
    await waitForTabComplete(tab.id, 15000);

    let filled = null;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [autofillPayload],
        func: async (payload) => {
          const mod = await import(chrome.runtime.getURL('src/content/shopee-autofill.js'));
          return mod.runShopeeAutofill(payload);
        },
      });
      filled = results?.[0]?.result ?? null;
    } catch (err) {
      // 分頁無法注入（尚未登入蝦皮、被導去登入頁…）：回報全數未填，讓 UI 走剪貼簿備援
      console.warn('[listio] shopee autofill inject failed', err);
      filled = { title: false, description: false, price: false, stock: false, sku: false, uploadedImages: 0, injectError: String(err?.message || err) };
    }

    track('shopee_autofill', { images: images.length, filled: Boolean(filled?.title && filled?.description && filled?.price) });
    return { tabId: tab.id, imagesCount: images.length, filled };
  },

  [MSG.TELEMETRY]: ({ name, props }) => {
    track(name, props);
    return { ok: true };
  },

  /** 側邊欄畫首圖用：以 service worker 的 host permission 抓圖轉 data URL，避免 canvas 被跨網域圖片污染。 */
  [MSG.IMAGE_FETCH]: async ({ url }) => {
    if (!/^https?:\/\//i.test(String(url || ''))) throw new ListioError('IMAGE_FETCH', '不支援的圖片網址');
    const r = await fetchImageBase64(url);
    return { dataUrl: `data:${r.mimeType};base64,${r.dataBase64}` };
  },
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handler = handlers[message?.type];
  if (!handler) return false;
  ready
    .then(() => handler(message))
    .then((data) => sendResponse(ok(data)))
    .catch((err) => {
      const code = err instanceof ListioError ? err.code : 'INTERNAL';
      const copy = ERROR_COPY[code] || ERROR_COPY.INTERNAL;
      console.warn('[listio]', message.type, err);
      sendResponse(fail(code, err?.message || copy.message, err?.hint || copy.hint));
    });
  return true; // 非同步回應
});

function waitForTabComplete(tabId, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdate);
      resolve();
    }, timeoutMs);
    function onUpdate(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdate);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdate);
  });
}

function maskSettings(settings, reveal = false) {
  if (reveal || !settings.geminiApiKey) return settings;
  const k = settings.geminiApiKey;
  return { ...settings, geminiApiKey: `${k.slice(0, 4)}…${k.slice(-4)}`, geminiApiKeyMasked: true };
}
