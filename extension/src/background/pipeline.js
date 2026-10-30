// 上架流程狀態機：extract → generate → compose。與 chrome.* 解耦，依賴由 service worker 注入。
import {
  JOB_STATUS,
  PROGRESS_STEPS,
  ListioError,
  ERROR_COPY,
  newJob,
} from '../shared/contract.js';
import { buildSystemPrompt, buildUserParts, composeTitle, composeDescription, normalizeGenerated } from '../shared/prompt.js';
import { computePrice } from '../shared/pricing.js';
import { initialDraft } from '../shared/draft.js';
import { checkCompliance } from '../shared/compliance.js';

/** @typedef {import('../shared/contract.js').Job} Job */
/** @typedef {import('../shared/contract.js').Brand} Brand */
/** @typedef {import('../shared/contract.js').Draft} Draft */

const MAX_IMAGE_BYTES = 1024 * 1024;

/**
 * @param {{
 *   store: ReturnType<import('../shared/storage.js').createStore>,
 *   extract: (tabId:number) => Promise<any>,
 *   fetchImage: (url:string) => Promise<{mimeType:string, dataBase64:string, bytes:number}|null>,
 *   generate: (req:any, settings:any) => Promise<{generated:any, usage?:any, model:string}>,
 *   emit: (job:Job) => void,
 *   track: (name:string, props?:any) => void,
 * }} deps
 */
export function createPipeline(deps) {
  const { store, emit, track } = deps;

  async function save(job, patch = {}) {
    Object.assign(job, patch, { updatedAt: Date.now() });
    await store.saveJob(job);
    emit(job);
    return job;
  }

  function setProgress(job, step) {
    const p = PROGRESS_STEPS.find((s) => s.step === step) || PROGRESS_STEPS[0];
    job.progress = { step: p.step, label: p.label };
  }

  async function failJob(job, err) {
    const code = err instanceof ListioError ? err.code : 'INTERNAL';
    const copy = ERROR_COPY[code] || ERROR_COPY.INTERNAL;
    const error = { code, message: err?.message || copy.message, hint: err?.hint || copy.hint };
    if (err?.upgradeUrl) error.upgradeUrl = err.upgradeUrl;
    track('generate_fail', { code, step: job.progress.step });
    return save(job, { status: JOB_STATUS.ERROR, error });
  }

  /** 建立並執行一個新工作。回傳的 job 在 extracting 狀態；後續狀態由 emit 推播。 */
  async function start({ tabId, brandId }) {
    const settings = await store.getSettings();
    const brand = await store.getBrand(brandId || settings.activeBrandId);
    const job = newJob({ tabId, brandId: brand.id });
    await save(job);
    run(job, brand, settings).catch((err) => failJob(job, err));
    return job;
  }

  async function run(job, brand, settings) {
    // 1. 擷取
    setProgress(job, 'extract');
    const result = await deps.extract(job.tabId);
    if (!result || result.error || !Array.isArray(result.images)) {
      const code = result?.error?.code || 'EXTRACT_EMPTY';
      throw new ListioError(code, result?.error?.message || ERROR_COPY[code].message, ERROR_COPY[code].hint);
    }
    job.product = result;
    job.draft = initialDraft(result, brand);
    track('capture_ok', { site: result.site, strategy: result.extractor?.strategy, images: result.images.length });
    if (!result.images.length) track('selector_miss', { site: result.site, strategy: result.extractor?.strategy });
    await save(job, { status: JOB_STATUS.GENERATING });

    // 2. 生成
    setProgress(job, 'generate');
    await save(job);
    await generateInto(job, brand, settings, { field: 'all' });

    // 3. 組版與檢查
    setProgress(job, 'compose');
    recompute(job, brand);
    track('generate_ok', { site: job.product.site });
    await save(job, { status: JOB_STATUS.READY, error: null });
  }

  async function generateInto(job, brand, settings, options) {
    const image = await pickImage(job);
    const req = {
      brand: { name: brand.name, tagline: brand.tagline, persona: brand.persona, shippingNote: brand.shippingNote, materialClaims: brand.materialClaims },
      product: { site: job.product.site, title: job.product.title, attrs: job.product.attrs, skus: job.product.skus, price: job.product.price },
      image,
      options: { ...options, platform: 'shopee', locale: 'zh-TW' },
      // BYOK 用：後端自己會組 prompt。
      byok: { systemInstruction: buildSystemPrompt(brand, options), parts: buildUserParts(job.product, image) },
    };
    const { generated: raw, usage } = await deps.generate(req, settings);
    const generated = normalizeGenerated(raw);
    if (!generated.title && !generated.body) throw new ListioError('MODEL_ERROR', 'AI 回傳了空白內容', '再試一次。');
    if (image === null && job.product.images.length) generated.warnings.unshift('主圖下載失敗，這次是純文字生成。');

    const keepTitle = options.field === 'description' && job.generated;
    const keepBody = options.field === 'title' && job.generated;
    job.generated = {
      ...generated,
      ...(keepTitle ? { title: job.generated.title } : {}),
      ...(keepBody ? { slogan: job.generated.slogan, body: job.generated.body, signature: job.generated.signature, details: job.generated.details } : {}),
    };
    if (!keepTitle) job.draft.title = composeTitle(job.generated, brand);
    if (!keepBody) job.draft.description = composeDescription(job.generated, brand);
    // 重新產生會覆蓋該欄位，手動修改標記一併清除（UI 以此判斷之後要不要保護使用者的字）
    job.draft.editedFields = {
      ...(job.draft.editedFields || {}),
      ...(keepTitle ? {} : { title: false }),
      ...(keepBody ? {} : { description: false }),
    };
    job.draft.tags = job.generated.tags;
    if (usage) await store.setUsage(usage);
    else if (settings.mode === 'byok') await store.bumpUsage();
  }

  async function pickImage(job) {
    const idx = job.draft?.coverImageIndex ?? 0;
    const candidates = [job.product.images[idx], ...job.product.images.filter((_, i) => i !== idx)].filter(Boolean).slice(0, 3);
    for (const img of candidates) {
      try {
        const data = await deps.fetchImage(img.hiRes || img.url);
        if (data && data.bytes <= MAX_IMAGE_BYTES) return { mimeType: data.mimeType, dataBase64: data.dataBase64 };
      } catch {
        // 試下一張
      }
    }
    return null;
  }

  /**
   * 使用者修改草稿後重新計價與檢查。
   * @param {{silent?: boolean}} [opts] silent：純快取類更新（例如首圖縮圖）——不推播、不改排序、不更新時間
   */
  async function update(jobId, draftPatch, opts = {}) {
    const job = await store.getJob(jobId);
    if (!job?.draft) throw new ListioError('INTERNAL', '找不到這筆工作');
    const brand = await store.getBrand(job.brandId);
    const prevPrice = job.draft.price;
    job.draft = { ...job.draft, ...draftPatch };
    if (draftPatch.price) job.draft.price = { ...prevPrice, ...draftPatch.price };
    if (opts.silent) {
      await store.saveJob(job, { keepPosition: true });
      return job;
    }
    recompute(job, brand);
    return save(job);
  }

  /** 標記這筆已交付（帶入蝦皮／匯出 Excel／複製圖文），讓歷史列表看得出哪些做完了。 */
  async function markExported(jobId, via) {
    const job = await store.getJob(jobId);
    if (!job) throw new ListioError('INTERNAL', '找不到這筆工作');
    job.exportedAt = Date.now();
    job.exportedVia = via;
    return save(job);
  }

  async function regenerate(jobId, field = 'all', toneOverride = null) {
    const job = await store.getJob(jobId);
    if (!job?.product) throw new ListioError('INTERNAL', '這筆工作還沒有商品資料');
    const settings = await store.getSettings();
    const brand = await store.getBrand(job.brandId);
    setProgress(job, 'generate');
    await save(job, { status: JOB_STATUS.GENERATING, error: null });
    try {
      await generateInto(job, brand, settings, { field, toneOverride });
      setProgress(job, 'compose');
      recompute(job, brand);
      return await save(job, { status: JOB_STATUS.READY });
    } catch (err) {
      // 保留原本的草稿，讓使用者仍可編輯與匯出。
      return failJob(job, err);
    }
  }

  function recompute(job, brand) {
    job.draft.price = computePrice(job.draft.price);
    job.compliance = checkCompliance(job, brand);
  }

  return { start, update, regenerate, markExported };
}
