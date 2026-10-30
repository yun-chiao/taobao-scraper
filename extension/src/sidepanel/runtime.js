// Side panel 與擴充 runtime 的唯一接觸點。
// - chromeRuntime：真的 chrome.runtime / chrome.downloads / chrome.tabs
// - mockRuntime：沒有 chrome.* 時（例如瀏覽器預覽 ?mock=1）模擬整條流程，並支援與外層模擬商品頁連動
import { MSG, UI_PORT_NAME, JOB_STATUS, PROGRESS_STEPS, newUsage, quotaRemaining, newJob, ok, fail } from '../shared/contract.js';
import { createStore, memoryBackend } from '../shared/storage.js';
import { seedBrand, defaultSettings } from '../shared/brands.js';
import { computePrice } from '../shared/pricing.js';
import { checkCompliance } from '../shared/compliance.js';
import { composeTitle, composeDescription } from '../shared/prompt.js';
import { initialDraft } from '../shared/draft.js';

export function createRuntime() {
  const hasChrome = typeof chrome !== 'undefined' && chrome.runtime?.id;
  const params = new URLSearchParams(location.search);
  if (!hasChrome || params.get('mock') === '1') return mockRuntime(params);
  return chromeRuntime();
}

function chromeRuntime() {
  const listeners = new Set();
  let port = null;
  const connect = () => {
    port = chrome.runtime.connect({ name: UI_PORT_NAME });
    port.onMessage.addListener((msg) => listeners.forEach((fn) => fn(msg)));
    port.onDisconnect.addListener(() => setTimeout(connect, 500));
  };
  connect();

  return {
    isMock: false,
    async send(type, payload = {}) {
      const res = await chrome.runtime.sendMessage({ type, ...payload });
      if (!res) throw { code: 'INTERNAL', message: '背景程式沒有回應', hint: '請重新載入擴充功能。' };
      if (!res.ok) throw res.error;
      return res.data;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    openOptions: (tab) => chrome.tabs.create({ url: chrome.runtime.getURL(`src/options/index.html${tab ? `?tab=${tab}` : ''}`) }),
    async download(dataUrl, filename) {
      await chrome.downloads.download({ url: dataUrl, filename, saveAs: false });
    },
    openUrl: (url) => chrome.tabs.create({ url }),
  };
}

// ---------------------------------------------------------------------------
// Mock Runtime：支援 3 組擬真商品範本與 postMessage 連動
// ---------------------------------------------------------------------------
function mockRuntime(params) {
  const listeners = new Set();
  const broadcast = (msg) => listeners.forEach((fn) => fn(msg));
  const scenario = params.get('state') || 'ready';
  const store = createStore(memoryBackend());
  const brand = seedBrand();
  // 預設情境：雲端免費方案（不需金鑰）。加 `&mode=byok` 可預覽自備金鑰模式。
  const mockMode = params.get('mode') === 'byok' ? 'byok' : 'cloud';
  const settings = {
    ...defaultSettings(),
    mode: mockMode,
    onboarded: params.get('view') !== 'onboarding',
    geminiApiKey: mockMode === 'byok' ? 'AIzaSyMOCK…1234' : '',
    authToken: mockMode === 'cloud' ? 'mock-anon-token' : '',
    deviceId: '6f1d2c3b-4a5e-4f60-8b9c-0d1e2f3a4b5c',
  };
  // 免費方案終身 10 件；加 `&used=10` 可預覽額度用完的狀態。
  const usedParam = Number(params.get('used'));
  const usage = newUsage({ plan: 'free', used: Number.isFinite(usedParam) && params.has('used') ? usedParam : 3 });

  const catalog = buildSampleCatalog();
  let currentKey = params.get('item') || 'earring';
  const getCurrentSample = () => catalog[currentKey] || catalog.earring;

  const makePage = () => {
    if (scenario === 'unsupported') {
      return { supported: false, site: null, url: 'https://www.google.com/', title: 'Google', tabId: 1 };
    }
    const { product } = getCurrentSample();
    return {
      supported: true,
      site: product.site,
      url: product.url,
      title: product.title,
      price: product.price?.amount,
      tabId: 1,
    };
  };

  let page = makePage();

  if (typeof window !== 'undefined') {
    window.addEventListener('message', (ev) => {
      const data = ev.data;
      if (data?.type === 'LISTIO_SELECT_PRODUCT' && catalog[data.key]) {
        currentKey = data.key;
        page = makePage();
        broadcast({ type: MSG.PAGE_CHANGED, page, navigateHome: true });
      }
    });
  }

  const init = (async () => {
    await store.init();
    await store.saveBrand(brand);
    await store.setSettings(settings);
    for (const j of sampleHistory(brand, catalog)) await store.saveJob(j);
    if (params.get('view') === 'job') {
      const sample = getCurrentSample();
      const job = sampleJob(brand, sample.product, sample.generated, scenario);
      await store.saveJob(job);
      globalThis.__mockJobId = job.id;
    }
  })();

  async function runFakePipeline(job, sample) {
    const tick = (ms) => new Promise((r) => setTimeout(r, ms));
    const emit = async () => {
      job.updatedAt = Date.now();
      await store.saveJob(job);
      broadcast({ type: MSG.JOB_CHANGED, job: structuredClone(job) });
    };
    await tick(350);
    job.product = sample.product;
    job.draft = initialDraft(sample.product, brand);
    job.status = JOB_STATUS.GENERATING;
    job.progress = { ...PROGRESS_STEPS[1] };
    await emit();
    await tick(1600);
    if (scenario === 'error') {
      job.status = JOB_STATUS.ERROR;
      job.error = { code: 'MODEL_ERROR', message: 'AI 暫時沒有回應（連線逾時）', hint: '稍後再試，或到設定換一個模型。' };
      return emit();
    }
    const latestBrand = (await store.listBrands()).find((b) => b.id === job.brandId) || brand;
    job.generated = sample.generated;
    job.draft.title = composeTitle(job.generated, latestBrand);
    job.draft.description = composeDescription(job.generated, latestBrand);
    job.draft.tags = job.generated.tags;
    job.draft.price = computePrice(job.draft.price);
    job.compliance = checkCompliance(job, latestBrand);
    job.status = JOB_STATUS.READY;
    job.progress = { ...PROGRESS_STEPS[2] };
    const latestSettings = await store.getSettings();
    if (latestSettings.mode === 'cloud') {
      usage.used += 1;
      broadcast({ type: MSG.USAGE_CHANGED, usage: { ...usage } });
    }
    return emit();
  }

  const handlers = {
    [MSG.PAGE_PROBE]: async () => page,
    [MSG.JOB_START]: async ({ brandId } = {}) => {
      if (!page.supported) throw fail('UNSUPPORTED_PAGE', '這不是支援的商品頁', '請開啟淘寶、天貓或 1688 商品頁。').error;
      const current = await store.getSettings();
      if (current.mode === 'cloud' && quotaRemaining(usage) === 0) {
        throw fail('QUOTA_EXCEEDED', `免費 ${usage.limit} 件已用完`, '升級 Pro 每月 150 件；或到設定改用自備 Gemini 金鑰，不限件數。').error;
      }
      if (current.mode === 'byok' && !current.geminiApiKey) {
        throw fail('NO_API_KEY', '尚未填入 Gemini API Key', '到設定 → 方案與金鑰貼上金鑰，或切回 Listio 雲端。').error;
      }
      const sample = getCurrentSample();
      const activeBrand = (await store.listBrands()).find((b) => b.id === brandId) || brand;
      const job = newJob({ tabId: 1, brandId: activeBrand.id, product: sample.product });
      job.draft = initialDraft(sample.product, activeBrand);
      await store.saveJob(job);
      runFakePipeline(job, sample);
      return structuredClone(job);
    },
    [MSG.JOB_GET]: async ({ jobId }) => store.getJob(jobId),
    [MSG.JOB_LIST]: async ({ limit }) => store.listJobs(limit),
    [MSG.JOB_UPDATE]: async ({ jobId, draftPatch, silent }) => {
      const job = await store.getJob(jobId);
      const prevPrice = job.draft.price;
      job.draft = { ...job.draft, ...draftPatch };
      if (draftPatch.price) job.draft.price = computePrice({ ...prevPrice, ...draftPatch.price });
      if (silent) {
        await store.saveJob(job, { keepPosition: true });
        return structuredClone(job);
      }
      const activeBrand = (await store.listBrands()).find((b) => b.id === job.brandId) || brand;
      job.compliance = checkCompliance(job, activeBrand);
      job.updatedAt = Date.now();
      await store.saveJob(job);
      broadcast({ type: MSG.JOB_CHANGED, job: structuredClone(job) });
      return job;
    },
    [MSG.JOB_MARK_EXPORTED]: async ({ jobId, via }) => {
      const job = await store.getJob(jobId);
      if (!job) throw fail('INTERNAL', '找不到這筆工作').error;
      job.exportedAt = Date.now();
      job.exportedVia = via;
      job.updatedAt = Date.now();
      await store.saveJob(job);
      broadcast({ type: MSG.JOB_CHANGED, job: structuredClone(job) });
      return structuredClone(job);
    },
    [MSG.JOB_REGENERATE]: async ({ jobId, field = 'all' }) => {
      const job = await store.getJob(jobId);
      job.status = JOB_STATUS.GENERATING;
      job.progress = { ...PROGRESS_STEPS[1] };
      await store.saveJob(job);
      broadcast({ type: MSG.JOB_CHANGED, job: structuredClone(job) });
      setTimeout(async () => {
        const sample = getCurrentSample();
        const activeBrand = (await store.listBrands()).find((b) => b.id === job.brandId) || brand;
        // 在兩個版本之間輪替，讓「換一個」看得出差別
        job.mockAlt = !job.mockAlt;
        const next = job.mockAlt && sample.altGenerated ? sample.altGenerated : sample.generated;
        const keepTitle = field === 'description';
        const keepBody = field === 'title';
        job.generated = {
          ...next,
          ...(keepTitle && job.generated ? { title: job.generated.title } : {}),
          ...(keepBody && job.generated
            ? { slogan: job.generated.slogan, body: job.generated.body, signature: job.generated.signature, details: job.generated.details }
            : {}),
        };
        if (!keepTitle) job.draft.title = composeTitle(job.generated, activeBrand);
        if (!keepBody) job.draft.description = composeDescription(job.generated, activeBrand);
        job.draft.editedFields = {
          ...(job.draft.editedFields || {}),
          ...(keepTitle ? {} : { title: false }),
          ...(keepBody ? {} : { description: false }),
        };
        job.compliance = checkCompliance(job, activeBrand);
        job.status = JOB_STATUS.READY;
        job.updatedAt = Date.now();
        await store.saveJob(job);
        broadcast({ type: MSG.JOB_CHANGED, job: structuredClone(job) });
      }, 900);
      return structuredClone(job);
    },
    [MSG.JOB_DELETE]: async ({ jobId }) => {
      await store.deleteJob(jobId);
      return { deleted: true };
    },
    [MSG.SETTINGS_GET]: async () => store.getSettings(),
    [MSG.SETTINGS_SET]: async ({ patch }) => {
      const s = await store.setSettings(patch);
      broadcast({ type: MSG.SETTINGS_CHANGED, settings: s });
      return s;
    },
    [MSG.SETTINGS_TEST_KEY]: async () => ({ ok: true, model: settings.model }),
    [MSG.BRAND_LIST]: async () => store.listBrands(),
    [MSG.BRAND_SAVE]: async ({ brand: b }) => store.saveBrand(b),
    [MSG.BRAND_DELETE]: async ({ brandId }) => {
      await store.deleteBrand(brandId);
      return { deleted: true };
    },
    [MSG.USAGE_GET]: async () => ({ ...usage }),
    [MSG.EXPORT_SHEET]: async () => {
      await new Promise((r) => setTimeout(r, 400));
      return { synced: true };
    },
    [MSG.EXPORT_SHOPEE_AUTOFILL]: async ({ jobId, coverDataUrl }) => {
      const job = await store.getJob(jobId);
      if (!job?.draft) throw { code: 'INTERNAL', message: '找不到這筆商品紀錄' };
      const images = [];
      if (coverDataUrl) {
        images.push({ filename: '01_品牌首圖.png', mimeType: 'image/png', dataUrl: coverDataUrl });
      }
      const prodImgs = job.product?.images || [];
      for (const idx of job.draft.selectedImages || []) {
        if (images.length >= 9) break;
        if (coverDataUrl && idx === job.draft.coverImageIndex) continue;
        const srcUrl = prodImgs[idx]?.hiRes || prodImgs[idx]?.url;
        if (srcUrl) {
          images.push({ filename: `0${images.length + 1}_商品圖.jpg`, mimeType: 'image/jpeg', dataUrl: srcUrl });
        }
      }
      const autofillPayload = {
        title: job.draft.title,
        description: job.draft.description,
        price: job.draft.price.final,
        stock: job.draft.stock ?? 20,
        daysToShip: job.draft.daysToShip ?? 10,
        parentSku: job.product?.itemId ? `${job.product.site.toUpperCase()}-${job.product.itemId}` : '',
        site: job.product?.site || 'taobao',
        images,
        requestId: `req_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      };
      // 外層模擬蝦皮頁會真的跑 fillShopeeProductForm，並把 filled 結果回傳；逾時則視為全部成功
      let filled = null;
      if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
        filled = await new Promise((resolve) => {
          const timer = setTimeout(() => {
            window.removeEventListener('message', onMsg);
            resolve(null);
          }, 2500);
          function onMsg(ev) {
            if (ev.data?.type === 'LISTIO_MOCK_SHOPEE_RESULT' && ev.data.requestId === autofillPayload.requestId) {
              clearTimeout(timer);
              window.removeEventListener('message', onMsg);
              resolve(ev.data.filled || null);
            }
          }
          window.addEventListener('message', onMsg);
          window.parent.postMessage({ type: 'LISTIO_OPEN_MOCK_SHOPEE', payload: autofillPayload }, '*');
        });
      }
      return { tabId: 99, imagesCount: images.length, filled };
    },
    [MSG.TELEMETRY]: async () => ({ ok: true }),
    [MSG.IMAGE_FETCH]: async ({ url }) => ({ dataUrl: url }),
  };

  return {
    isMock: true,
    async send(type, payload = {}) {
      await init;
      const h = handlers[type];
      if (!h) throw { code: 'INTERNAL', message: `mock 未實作 ${type}` };
      return h(payload);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    openOptions: (tab) => window.open(`../options/index.html?mock=1&v=13${tab ? `&tab=${tab}` : ''}`, '_blank'),
    async download(dataUrl, filename) {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename;
      a.click();
    },
    openUrl: (url) => window.open(url, '_blank'),
  };
}

// ---------------------------------------------------------------------------
// 擬真商品圖片與範例資料庫
// ---------------------------------------------------------------------------
function drawSampleArt(kind, variant = 0, w = 520, h = 520) {
  if (typeof document === 'undefined') return 'https://img.alicdn.com/sample.jpg';
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');

  const bgs = [
    ['#F6F2EB', '#E7DFD2'],
    ['#EFECE6', '#DDD6C9'],
    ['#F8F6F2', '#EAE4DA'],
    ['#ECE8E1', '#D6CEC0'],
  ];
  const [c1, c2] = bgs[variant % bgs.length];
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // 柔和桌面光影
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.beginPath();
  ctx.ellipse(w * 0.35, h * 0.28, w * 0.42, h * 0.22, -0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(w / 2, h / 2);

  if (kind === 'earring') {
    const isSilver = variant % 2 === 1;
    ctx.strokeStyle = isSilver ? '#A8A9AD' : '#B99256';
    ctx.lineWidth = 26;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(40,30,15,0.16)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 12;
    ctx.beginPath();
    ctx.arc(-34, 8, 72, Math.PI * 0.2, Math.PI * 1.75);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(42, 22, 66, Math.PI * 0.25, Math.PI * 1.8);
    ctx.stroke();
  } else if (kind === 'pearl') {
    ctx.strokeStyle = '#C7A46C';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -20, 130, Math.PI * 0.12, Math.PI * 0.88);
    ctx.stroke();
    const pts = [-95, -58, -22, 16, 54, 90];
    pts.forEach((x, idx) => {
      const y = -20 + Math.sqrt(Math.max(0, 130 * 130 - x * x));
      ctx.fillStyle = idx === 2 ? '#FDFBF7' : '#F5EFE4';
      ctx.shadowColor = 'rgba(40,30,15,0.14)';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.ellipse(x, y, idx === 2 ? 22 : 14, idx === 2 ? 27 : 15, 0.2 * idx, 0, Math.PI * 2);
      ctx.fill();
    });
  } else {
    // 玳瑁抓夾
    ctx.rotate(-0.22 + variant * 0.08);
    ctx.fillStyle = variant % 2 === 0 ? '#6E472B' : '#C8B69E';
    ctx.shadowColor = 'rgba(30,20,10,0.18)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 10;
    ctx.beginPath();
    ctx.roundRect(-125, -36, 250, 72, 34);
    ctx.fill();
    ctx.fillStyle = 'rgba(246,242,235,0.85)';
    ctx.beginPath();
    ctx.roundRect(-85, -12, 170, 24, 12);
    ctx.fill();
  }
  ctx.restore();

  return c.toDataURL('image/jpeg', 0.88);
}

function buildSampleCatalog() {
  const mkImgs = (kind, itemId, count = 5) =>
    Array.from({ length: count }, (_, i) => {
      const url = drawSampleArt(kind, i);
      const publicUrl = `https://img.alicdn.com/imgextra/i${(i % 4) + 1}/${itemId}/O1CN01_${kind}_0${i + 1}.jpg`;
      return { url, hiRes: url, publicUrl };
    });

  return {
    earring: {
      product: {
        site: 'taobao',
        url: 'https://item.taobao.com/item.htm?id=7312345678',
        itemId: '7312345678',
        title: 's925纯银流动几何极简拉丝耳钉女新款冷淡风小众设计高级感气质耳环',
        images: mkImgs('earring', '7312345678', 5),
        price: { amount: 58, currency: 'CNY' },
        attrs: { 材质: '925银', 风格: '极简冷淡', 款式: '耳钉', 颜色分类: '拉丝金 / 质感银' },
        skus: [{ name: '颜色分类', options: ['拉丝金', '质感银'] }],
        shopName: '白昼金属实验所',
        extractor: { adapter: 'taobao', strategy: 'dom', warnings: [] },
      },
      generated: {
        title: '流動幾何・霧面拉絲耳釘 極簡冷淡風 通勤氣質耳環',
        slogan: '安靜的霧面金屬光澤，日常穿搭最耐看的細節。',
        body: '流暢的弧面摺疊線條打破平面幾何的單調，表面以細緻拉絲處理，呈現低調內斂的霧面質感。\n\n不論搭配西裝外套或素色針織衫，都能在耳畔勾勒出乾淨俐落的輪廓，久戴也不覺厚重。',
        signature: '實品拿在手上的拉絲紋理非常細膩，折射出的光澤很溫潤。銀色俐落清爽、金色帶一點復古溫度，是很適合每天順手戴出門的常備款。',
        details: [
          { label: '顏色', value: '霧面拉絲金 / 質感亮銀' },
          { label: '工藝', value: '弧面立體摺疊、手工拉絲' },
          { label: '尺寸', value: '約 1.2 × 0.8 cm（單只約 1.5 g）' },
        ],
        tags: ['耳釘', '幾何耳環', '拉絲耳環', '極簡飾品', '通勤穿搭'],
        style: '極簡',
        materialHints: ['來源標題提及 s925'],
        warnings: [],
      },
      altGenerated: {
        title: '弧面摺疊拉絲耳釘 小眾極簡 霧面金屬日常耳環',
        slogan: '不張揚的立體弧度，替日常輪廓添一分俐落。',
        body: '以柔和的摺疊曲面取代生硬稜角，搭配霧面拉絲表面，近看有細節、遠看乾淨耐看。輕巧不墜耳，從上班通勤到週末聚會都能自然融入。',
        signature: '自己留了一副拉絲金，搭白襯衫特別好看，推薦給喜歡極簡線條的妳。',
        details: [
          { label: '顏色', value: '霧面拉絲金 / 質感亮銀' },
          { label: '尺寸', value: '約 1.2 × 0.8 cm' },
        ],
        tags: ['耳釘', '拉絲耳環', '極簡風'],
        style: '輕奢',
        materialHints: [],
        warnings: [],
      },
    },

    pearl: {
      product: {
        site: 'tmall',
        url: 'https://detail.tmall.com/item.htm?id=8091122334',
        itemId: '8091122334',
        title: '巴洛克异形淡水珍珠项链女夏轻奢小众锁骨链复古高级感颈链配饰',
        images: mkImgs('pearl', '8091122334', 4),
        price: { amount: 89, currency: 'CNY' },
        attrs: { 材质: '淡水珍珠/镀金链', 链长: '38cm+5cm延长链', 风格: '法式复古' },
        skus: [{ name: '规格', options: ['单颗巴洛克吊坠', '双层叠戴组'] }],
        shopName: '南风珍珠旗舰店',
        extractor: { adapter: 'tmall', strategy: 'state', warnings: [] },
      },
      generated: {
        title: '不規則巴洛克珍珠鎖骨鍊 法式復古 溫潤光澤細鍊項鍊',
        slogan: '每一顆都有獨特的自然弧度，貼合鎖骨的溫柔微光。',
        body: '選用帶有自然生長紋理的異形珠造型，搭配纖細鎖骨鍊，單戴就能撐起領口重點。\n\n附 5 公分延長鍊，可依襯衫領口或方領洋裝自由調節長度，疊戴素面細金鍊也很有層次。',
        signature: '不規則珠形比正圓珍珠更隨性日常，配一件簡單的白 T 就有法式慵懶感，不會顯得過於正式。',
        details: [
          { label: '款式', value: '單顆吊墜款 / 雙層疊戴組' },
          { label: '尺寸', value: '鍊長約 38 + 5 cm 延長鍊' },
        ],
        tags: ['珍珠項鍊', '巴洛克珍珠', '鎖骨鍊', '法式復古'],
        style: '法式',
        materialHints: ['來源標示淡水珍珠'],
        warnings: [],
      },
    },

    clip: {
      product: {
        site: '1688',
        url: 'https://detail.1688.com/offer/6889900112.html',
        itemId: '6889900112',
        title: '法式复古醋酸玳瑁抓夹大号后脑勺盘发鲨鱼夹义乌源头工厂批发',
        images: mkImgs('clip', '6889900112', 4),
        price: { amount: 12.5, currency: 'CNY' },
        attrs: { 材质: '醋酸板材', 尺寸: '11.5cm大号', 起批量: '2件起批' },
        skus: [{ name: '颜色', options: ['经典琥珀玳瑁', '奶油燕麦白'] }],
        shopName: '义乌市星辰发饰厂',
        extractor: { adapter: '1688', strategy: 'state', warnings: [] },
      },
      generated: {
        title: '琥珀玳瑁大號盤髮抓夾 法式復古 厚髮量穩固鯊魚夾',
        slogan: '隨手一挽就俐落有型，厚髮量也能穩穩收攏。',
        body: '溫潤透光的琥珀玳瑁紋路，邊緣打磨圓滑不刮頭皮。11.5 公分加寬夾齒設計，中長髮與厚髮量都能輕鬆盤起，居家或外出通勤都很實用。',
        signature: '彈簧咬合力很紮實，走動一整天不太會鬆滑；琥珀色在陽光下透出的紋理比一般塑膠夾有質感許多。',
        details: [
          { label: '顏色', value: '經典琥珀玳瑁 / 奶油燕麥白' },
          { label: '長度', value: '約 11.5 cm 大號尺寸' },
        ],
        tags: ['抓夾', '鯊魚夾', '玳瑁髮夾', '法式盤髮'],
        style: '復古',
        materialHints: ['醋酸板材'],
        warnings: [],
      },
    },
  };
}

function sampleJob(brand, product, generated, scenario) {
  const job = newJob({ tabId: 1, brandId: brand.id, product });
  job.draft = initialDraft(product, brand);
  if (scenario === 'running') {
    job.status = JOB_STATUS.GENERATING;
    job.progress = { ...PROGRESS_STEPS[1] };
    return job;
  }
  job.generated = generated;
  job.draft.title = composeTitle(generated, brand);
  job.draft.description = composeDescription(generated, brand);
  job.draft.tags = generated.tags;
  job.draft.price = computePrice(job.draft.price);
  if (scenario === 'error') {
    job.status = JOB_STATUS.ERROR;
    job.error = { code: 'QUOTA_EXCEEDED', message: '免費 10 件已用完', hint: '升級 Pro 每月 150 件；或到設定改用自備 Gemini 金鑰，不限件數。' };
    return job;
  }
  job.compliance = checkCompliance(job, brand);
  job.status = JOB_STATUS.READY;
  job.progress = { ...PROGRESS_STEPS[2] };
  return job;
}

function sampleHistory(brand, catalog) {
  const mk = (sample, hoursAgo, exported) => {
    const job = sampleJob(brand, sample.product, sample.generated, 'ready');
    job.createdAt = job.updatedAt = Date.now() - hoursAgo * 3600 * 1000;
    if (exported) {
      job.exportedVia = exported;
      job.exportedAt = job.updatedAt + 15 * 60 * 1000;
    }
    return job;
  };
  // 珍珠項鍊：已帶入蝦皮；玳瑁抓夾：還沒交付（示範歷史列的兩種狀態）
  return [mk(catalog.pearl, 4, 'shopee'), mk(catalog.clip, 22, null)];
}

export { ok };
