// Side Panel 主控制器：極簡單一動線、Canvas 2D 即時首圖渲染與一鍵複製／匯出
import { MSG, JOB_STATUS, newUsage } from '../shared/contract.js';
import { personaFromPreset, PALETTE_PRESETS, seedBrand } from '../shared/brands.js';
import { computePrice } from '../shared/pricing.js';
import { applyFix } from '../shared/compliance.js';
import { composeTitle, composeDescription } from '../shared/prompt.js';
import { getPreset, buildWorkbookRows, buildClipboardText, filenameFor } from '../shared/shopee-template.js';
import { createRuntime } from './runtime.js';
import { getTemplate } from './cover/templates.js';
import { drawCover } from './cover/renderer.js';
import { makePreviewOrnament } from './cover/sample-art.js';
import { html, icon, toast, openMenu, copyText, debounce, renderInto } from './ui.js';
import { renderHome } from './views/home.js';
import {
  renderJobView,
  formatPriceSub,
  priceSubTone,
  formatFormulaNote,
  suggestHint,
  groupIssues,
  renderIssueList,
} from './views/job.js';
import { renderOnboarding } from './views/onboarding.js';

const rt = createRuntime();
const imageCache = new Map();

const state = {
  route: 'home',
  page: { supported: false, site: null, url: '', title: '' },
  settings: null,
  brands: [],
  brand: seedBrand(),
  usage: newUsage(),
  jobs: [],
  job: null,
  priceDrawerOpen: false,
  /** 重新產生前的快照：{ jobId, field, title, description, edited } */
  undo: null,
  /** 歷史列「兩段式刪除」：第一次點變成「確定刪除」，3 秒內再點才真的刪 */
  pendingDeleteId: null,
};

async function boot() {
  const [settings, brands, usage, jobs, page] = await Promise.all([
    rt.send(MSG.SETTINGS_GET),
    rt.send(MSG.BRAND_LIST),
    rt.send(MSG.USAGE_GET),
    rt.send(MSG.JOB_LIST, { limit: 25 }),
    rt.send(MSG.PAGE_PROBE),
  ]);

  state.settings = settings;
  state.brands = brands;
  state.brand = brands.find((b) => b.id === settings.activeBrandId) || brands[0] || seedBrand();
  state.usage = usage;
  state.jobs = jobs;
  state.page = page;

  const params = new URLSearchParams(location.search);
  const forcedView = params.get('view');
  if (forcedView === 'onboarding' || !settings.onboarded) {
    state.route = 'onboarding';
  } else if (forcedView === 'job') {
    state.job = jobs.find((j) => j.id === globalThis.__mockJobId) || jobs[0] || null;
    state.route = 'job';
  } else {
    state.route = 'home';
  }

  rt.subscribe(onPushMessage);
  bindEvents();
  render();
}

function isUserTypingInView() {
  const active = document.activeElement;
  if (!active) return false;
  const view = document.getElementById('view');
  return Boolean(view?.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA'));
}

function syncPriceDomInPlace() {
  const draft = state.job?.draft;
  if (!draft) return;
  const subEl = document.getElementById('priceSubText');
  if (subEl) {
    subEl.textContent = formatPriceSub(draft);
    subEl.className = `price-sub ${priceSubTone(draft)}`;
  }
  const noteEl = document.getElementById('priceFormulaNote');
  if (noteEl) noteEl.textContent = formatFormulaNote(draft.price);
  const finalInput = document.getElementById('draftFinalPrice');
  if (finalInput && document.activeElement !== finalInput) {
    finalInput.value = draft.price.final ?? '';
  }
  const suggestBtn = document.getElementById('priceSuggestBtn');
  if (suggestBtn) {
    const hint = suggestHint(draft.price);
    suggestBtn.textContent = hint;
    suggestBtn.hidden = !hint;
  }
  // 售價相關的合規提示（例如低於成本）也就地更新，不重建整個畫面
  const issues = groupIssues(state.job.compliance);
  const priceIssuesEl = document.getElementById('priceIssues');
  if (priceIssuesEl) priceIssuesEl.innerHTML = String(renderIssueList(issues.price));
  if (finalInput) finalInput.classList.toggle('is-invalid', issues.price.some(({ issue }) => issue.level === 'block'));
}

/** 重新產生完成後，提供 5 秒「還原上一版」的機會（不彈 confirm）。 */
function maybeOfferUndo(job) {
  const snap = state.undo;
  if (!snap || snap.jobId !== job.id) return;
  if (job.status === JOB_STATUS.GENERATING || job.status === JOB_STATUS.EXTRACTING) return;
  state.undo = null;
  if (job.status !== JOB_STATUS.READY) return;

  const fieldLabel = snap.field === 'title' ? '標題' : snap.field === 'description' ? '內文' : '標題與內文';
  const touched = snap.field === 'all' ? ['title', 'description'] : [snap.field];
  const overwroteEdits = touched.some((k) => snap.edited?.[k]);
  const message = overwroteEdits ? `已重寫${fieldLabel}（覆蓋了你手動修改的內容）` : `已換一版${fieldLabel}`;

  toast(message, overwroteEdits ? 'danger' : 'success', 6000, {
    label: '還原',
    onClick: async () => {
      const draftPatch = {
        editedFields: { ...(state.job?.draft?.editedFields || {}), ...snap.edited },
      };
      for (const k of touched) draftPatch[k] = snap[k];
      state.job = await rt.send(MSG.JOB_UPDATE, { jobId: job.id, draftPatch });
      const idx = state.jobs.findIndex((j) => j.id === job.id);
      if (idx >= 0) state.jobs[idx] = state.job;
      render();
      toast('已還原上一版', 'success');
    },
  });
}

function onPushMessage(msg) {
  if (msg.type === MSG.JOB_CHANGED && msg.job) {
    const idx = state.jobs.findIndex((j) => j.id === msg.job.id);
    if (idx >= 0) state.jobs[idx] = msg.job;
    else state.jobs.unshift(msg.job);
    if (state.job?.id === msg.job.id) {
      state.job = msg.job;
      // 若使用者正在輸入框打字，絕不重建整個 DOM（避免 <details> 閃退或游標跳動）
      if (state.route === 'job' && isUserTypingInView()) {
        syncPriceDomInPlace();
        paintCover();
        maybeOfferUndo(msg.job);
        return;
      }
    }
    render();
    maybeOfferUndo(msg.job);
  } else if (msg.type === MSG.USAGE_CHANGED && msg.usage) {
    state.usage = msg.usage;
    if (state.route === 'home') render();
  } else if (msg.type === MSG.SETTINGS_CHANGED && msg.settings) {
    state.settings = msg.settings;
    state.brand = state.brands.find((b) => b.id === msg.settings.activeBrandId) || state.brand;
    render();
  } else if (msg.type === MSG.PAGE_CHANGED && msg.page) {
    state.page = msg.page;
    if (msg.navigateHome) state.route = 'home';
    render();
  }
}

function renderTopbar() {
  const el = document.getElementById('topbar');
  const brand = state.brand;

  el.innerHTML = html`
    <button class="brand-switch" data-action="switch-brand" title="切換賣場品牌">
      <span class="brand-dot" style="--dot-color:${brand.palette?.accent || '#18181b'}"></span>
      <span>${brand.name}</span>
      ${icon('chevron')}
    </button>
    <button class="icon-btn" data-action="open-options" title="設定">${icon('settings')}</button>
  `;
}

function render() {
  renderTopbar();
  const root = document.getElementById('view');

  if (state.route === 'onboarding') {
    renderInto(root, renderOnboarding(state));
    paintOnboardingPreview();
  } else if (state.route === 'job') {
    renderInto(root, renderJobView(state));
    paintCover();
    autoGrowTextarea(document.getElementById('draftDescription'));
  } else {
    renderInto(root, renderHome(state));
  }
}

/** 內文 textarea 隨內容長高（Chrome 123+ 用 CSS field-sizing；舊版用 scrollHeight）。 */
const supportsFieldSizing = typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content');
function autoGrowTextarea(el) {
  if (!el || supportsFieldSizing) return;
  el.style.height = 'auto';
  const max = Math.round(window.innerHeight * 0.6);
  el.style.height = `${Math.min(el.scrollHeight + 2, max)}px`;
}

// ---------- Canvas 首圖繪製 ----------
/**
 * 載入要畫到 canvas 上的圖片。
 * 先以 crossOrigin 直接載入（alicdn 有 CORS 標頭）；失敗時改請 service worker 用 host permission 抓圖轉 data URL，
 * 確保 canvas 不會被污染（否則 toDataURL 會丟 SecurityError，首圖下載與帶入蝦皮都會壞掉）。
 */
async function loadImageElement(url, { forceProxy = false } = {}) {
  if (!url) return null;
  const cacheKey = forceProxy ? `proxy:${url}` : url;
  if (imageCache.has(cacheKey)) return imageCache.get(cacheKey);

  const loadFrom = (src) =>
    new Promise((resolve) => {
      const img = new Image();
      if (!src.startsWith('data:')) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });

  const p = (async () => {
    if (!forceProxy) {
      const direct = await loadFrom(url);
      if (direct) return direct;
    }
    if (!/^https?:\/\//i.test(url)) return null;
    try {
      const { dataUrl } = await rt.send(MSG.IMAGE_FETCH, { url });
      return dataUrl ? await loadFrom(dataUrl) : null;
    } catch {
      return null;
    }
  })();
  imageCache.set(cacheKey, p);
  return p;
}

/** canvas 若被跨網域圖片污染，toDataURL 會丟錯：改用 service worker 代抓的圖重畫一次再輸出。 */
async function safeCanvasDataUrl(canvas, repaint) {
  try {
    return canvas.toDataURL('image/png', 1.0);
  } catch {
    await repaint({ forceProxy: true });
    return canvas.toDataURL('image/png', 1.0);
  }
}

async function paintCover({ forceProxy = false } = {}) {
  const job = state.job;
  const draft = job?.draft;
  if (!draft) return;

  const mainCanvas = document.getElementById('coverCanvas');
  if (!mainCanvas) return;

  const imgObj = job.product?.images?.[draft.coverImageIndex] || job.product?.images?.[0];
  const imgEl = await loadImageElement(imgObj?.hiRes || imgObj?.url, { forceProxy });
  const brand = state.brands.find((b) => b.id === job.brandId) || state.brand;
  const watermark = state.settings?.mode === 'cloud' && state.usage?.plan === 'free';
  // 第一次生成還沒有 AI 標題時，draft.title 是淘寶簡體原標題：首圖先只畫品牌名，不把簡體字畫上去
  const isFirstGeneration = (job.status === JOB_STATUS.EXTRACTING || job.status === JOB_STATUS.GENERATING) && !job.generated;

  await drawCover(mainCanvas.getContext('2d'), {
    size: 800,
    template: getTemplate(draft.coverTemplateId),
    brand,
    image: imgEl,
    title: isFirstGeneration ? '' : draft.title,
    watermark,
  });

  globalThis.__sidepanelReady = true;
  if (job.status === JOB_STATUS.READY) persistCoverThumb(job, mainCanvas);
}

/** 把畫好的首圖縮成 120px 存進 job（歷史列表用），靜默儲存：不推播、不改排序。 */
const lastThumbSent = new Map();
async function persistCoverThumb(job, mainCanvas) {
  try {
    const c = document.createElement('canvas');
    c.width = 120;
    c.height = 120;
    c.getContext('2d').drawImage(mainCanvas, 0, 0, 120, 120);
    const thumb = c.toDataURL('image/jpeg', 0.82);
    if (!thumb || thumb.length < 100) return;
    if (job.draft?.coverThumb === thumb || lastThumbSent.get(job.id) === thumb) return;
    lastThumbSent.set(job.id, thumb);
    await rt.send(MSG.JOB_UPDATE, { jobId: job.id, draftPatch: { coverThumb: thumb }, silent: true });
    if (state.job?.id === job.id && state.job.draft) state.job.draft.coverThumb = thumb;
    const idx = state.jobs.findIndex((j) => j.id === job.id);
    if (idx >= 0 && state.jobs[idx].draft) state.jobs[idx] = { ...state.jobs[idx], draft: { ...state.jobs[idx].draft, coverThumb: thumb } };
  } catch {
    // 縮圖只是列表裝飾，失敗不影響流程
  }
}

/** 標記這筆已交付，並同步更新列表與目前頁面。 */
async function markExported(jobId, via) {
  try {
    const updated = await rt.send(MSG.JOB_MARK_EXPORTED, { jobId, via });
    const idx = state.jobs.findIndex((j) => j.id === jobId);
    if (idx >= 0) state.jobs[idx] = updated;
    if (state.job?.id === jobId) state.job = updated;
    if (!isUserTypingInView()) render();
  } catch {
    // 標記失敗不影響已完成的交付
  }
}

/** Onboarding 的迷你首圖：換配色、改名稱時即時重畫，讓選擇有回饋。 */
let onboardingSample = null;
async function paintOnboardingPreview() {
  const c = document.getElementById('obCoverPreview');
  if (!c) return;
  if (!onboardingSample) onboardingSample = makePreviewOrnament(400);
  await drawCover(c.getContext('2d'), {
    size: 400,
    template: getTemplate(state.brand.coverTemplateId),
    brand: state.brand,
    image: onboardingSample,
    title: `${state.brand.name || '我的賣場'}｜弧面摺疊霧面拉絲耳針 簡約日常耳環`,
    watermark: false,
  });
}

// 輸入時的儲存：把 260ms 內的多次修改合併成一個 patch（避免先改標題再改內文時，前者被後者蓋掉）
let pendingPatch = null;
const flushDraftPatch = debounce(async () => {
  if (!state.job || !pendingPatch) return;
  const patch = pendingPatch;
  pendingPatch = null;
  try {
    state.job = await rt.send(MSG.JOB_UPDATE, { jobId: state.job.id, draftPatch: patch });
    syncPriceDomInPlace();
    paintCover();
  } catch (err) {
    toast(err.message || '儲存失敗', 'danger');
  }
}, 260);

function queueDraftPatch(patch) {
  pendingPatch = pendingPatch || {};
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'price' && v && typeof v === 'object') {
      pendingPatch.price = { ...(pendingPatch.price || {}), ...v };
    } else if (k === 'editedFields' && v && typeof v === 'object') {
      pendingPatch.editedFields = { ...(pendingPatch.editedFields || {}), ...v };
    } else {
      pendingPatch[k] = v;
    }
  }
  flushDraftPatch();
}

/** 使用者手動改過標題／內文 → 記下來，之後重寫或切換材質時才知道要不要保護。 */
function markEdited(field) {
  const draft = state.job?.draft;
  if (!draft) return;
  draft.editedFields = { ...(draft.editedFields || {}), [field]: true };
  return draft.editedFields;
}

// ---------- 事件代理 ----------
function bindEvents() {
  // 記住定價折疊抽屜的開關狀態，重新渲染時不會閃退收合
  document.body.addEventListener(
    'toggle',
    (e) => {
      if (e.target?.id === 'priceDrawer') {
        state.priceDrawerOpen = e.target.open;
      }
    },
    true,
  );

  document.body.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();
    try {
      await handleAction(btn.dataset.action, btn);
    } catch (err) {
      // 後端／runtime 的錯誤帶有 hint 時一併顯示，讓使用者知道下一步
      const msg = err?.hint ? `${err.message}｜${err.hint}` : err?.message || '操作失敗';
      toast(msg, 'danger', err?.hint ? 5200 : 2600);
    }
  });

  document.body.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.draftField && state.job?.draft) {
      const k = el.dataset.draftField;
      state.job.draft[k] = el.value;
      const editedFields = markEdited(k);
      if (k === 'title') {
        const counter = el.closest('.field')?.querySelector('.field-counter');
        const len = Array.from(el.value).length;
        if (counter) {
          counter.textContent = `${len} / 60`;
          counter.classList.toggle('is-over', len > 60);
        }
        paintCover();
      } else if (k === 'description') {
        autoGrowTextarea(el);
      }
      queueDraftPatch({ [k]: el.value, editedFields });
    } else if (el.dataset.draftNum && state.job?.draft) {
      const k = el.dataset.draftNum;
      const v = Number(el.value);
      state.job.draft[k] = v;
      syncPriceDomInPlace();
      queueDraftPatch({ [k]: v });
    } else if (el.dataset.priceField && state.job?.draft) {
      const k = el.dataset.priceField;
      const rawVal = el.value === '' ? null : Number(el.value);
      const pricePatch = { [k]: rawVal };
      if (k !== 'final') pricePatch.final = null;
      // 立即在記憶體同步試算並局部更新文字，零延遲且不重繪 DOM
      state.job.draft.price = computePrice({ ...state.job.draft.price, ...pricePatch });
      syncPriceDomInPlace();
      queueDraftPatch({ price: pricePatch });
    } else if (el.dataset.pricePct && state.job?.draft) {
      const k = el.dataset.pricePct;
      const pctVal = el.value === '' ? 0 : Math.min(80, Math.max(0, Number(el.value))) / 100;
      const pricePatch = { [k]: pctVal, final: null };
      state.job.draft.price = computePrice({ ...state.job.draft.price, ...pricePatch });
      syncPriceDomInPlace();
      queueDraftPatch({ price: pricePatch });
    } else if (el.dataset.obField) {
      const k = el.dataset.obField;
      state.brand[k] = el.value;
      if (k === 'name') {
        state.brand.badgeText = el.value.length > 4 ? `${el.value.slice(0, 4)}\n${el.value.slice(4, 8)}` : el.value;
        paintOnboardingPreview();
      }
    } else if (el.dataset.obSetting) {
      state.settings[el.dataset.obSetting] = el.value.trim();
    }
  });
}

async function handleAction(action, btn) {
  switch (action) {
    case 'nav-home':
      state.route = 'home';
      render();
      break;
    case 'open-options':
      rt.openOptions(btn.dataset.tab || '');
      break;

    case 'open-url':
      if (btn.dataset.url) rt.openUrl(btn.dataset.url);
      break;

    case 'upgrade':
      rt.send(MSG.TELEMETRY, { name: 'upgrade_click', props: { from: state.route } });
      rt.openOptions('account');
      break;

    case 'report-page': {
      const product = state.job?.product;
      rt.send(MSG.TELEMETRY, {
        name: 'selector_miss',
        props: {
          site: product?.site || state.page?.site || null,
          strategy: product?.extractor?.strategy || null,
          reported: true,
        },
      });
      toast('已回報這個頁面，謝謝！我們會優先修正。', 'success');
      break;
    }

    case 'switch-brand': {
      const items = state.brands.map((b) => ({
        label: b.name,
        active: b.id === state.brand.id,
        onClick: async () => {
          state.brand = b;
          state.settings = await rt.send(MSG.SETTINGS_SET, { patch: { activeBrandId: b.id } });
          render();
          toast(`已切換至「${b.name}」`);
        },
      }));
      items.push('sep', {
        label: '品牌與系統設定…',
        icon: 'settings',
        onClick: () => rt.openOptions(),
      });
      openMenu(btn, items);
      break;
    }

    case 'start-job': {
      const job = await rt.send(MSG.JOB_START, { brandId: state.brand.id });
      state.job = job;
      state.jobs.unshift(job);
      state.route = 'job';
      render();
      break;
    }

    case 'open-job': {
      const id = btn.dataset.jobId;
      state.job = state.jobs.find((j) => j.id === id) || (await rt.send(MSG.JOB_GET, { jobId: id }));
      state.route = 'job';
      render();
      break;
    }

    case 'pick-template': {
      state.job = await rt.send(MSG.JOB_UPDATE, {
        jobId: state.job.id,
        draftPatch: { coverTemplateId: btn.dataset.templateId },
      });
      render();
      break;
    }

    case 'set-cover-image': {
      const idx = Number(btn.dataset.index);
      const selected = state.job.draft.selectedImages.includes(idx)
        ? state.job.draft.selectedImages
        : [idx, ...state.job.draft.selectedImages].slice(0, 9);
      state.job = await rt.send(MSG.JOB_UPDATE, {
        jobId: state.job.id,
        draftPatch: { coverImageIndex: idx, selectedImages: selected },
      });
      render();
      break;
    }

    case 'toggle-image': {
      const idx = Number(btn.dataset.index);
      const cur = [...(state.job.draft.selectedImages || [])];
      const pos = cur.indexOf(idx);
      if (pos >= 0) {
        if (cur.length <= 1) return toast('至少需保留 1 張商品圖', 'danger');
        cur.splice(pos, 1);
      } else {
        if (cur.length >= 9) return toast('最多選取 9 張圖片', 'danger');
        cur.push(idx);
      }
      state.job = await rt.send(MSG.JOB_UPDATE, {
        jobId: state.job.id,
        draftPatch: { selectedImages: cur },
      });
      render();
      break;
    }

    case 'toggle-claim': {
      const key = btn.dataset.claim;
      state.brand.materialClaims = {
        ...state.brand.materialClaims,
        [key]: !state.brand.materialClaims?.[key],
      };
      await rt.send(MSG.BRAND_SAVE, { brand: state.brand });
      if (state.job?.generated) {
        // 只重組「沒有被手動改過」的欄位；手改過的保留，另外提供一鍵套用
        const edited = state.job.draft.editedFields || {};
        const recomposed = {
          title: composeTitle(state.job.generated, state.brand),
          description: composeDescription(state.job.generated, state.brand),
        };
        const patch = {};
        if (!edited.title) patch.title = recomposed.title;
        if (!edited.description) patch.description = recomposed.description;
        if (Object.keys(patch).length) {
          state.job = await rt.send(MSG.JOB_UPDATE, { jobId: state.job.id, draftPatch: patch });
        }
        render();
        const skipped = [edited.title ? '標題' : null, edited.description ? '內文' : null].filter(Boolean);
        if (skipped.length) {
          const jobId = state.job.id;
          toast(`材質設定已更新；${skipped.join('與')}已手動修改過，先不重新組版`, 'default', 6500, {
            label: '仍要套用',
            onClick: async () => {
              const prev = state.job?.draft || {};
              state.undo = {
                jobId,
                field: 'all',
                title: prev.title,
                description: prev.description,
                edited: { ...(prev.editedFields || {}) },
              };
              state.job = await rt.send(MSG.JOB_UPDATE, {
                jobId,
                draftPatch: { ...recomposed, editedFields: { title: false, description: false } },
              });
              render();
              maybeOfferUndo(state.job);
            },
          });
        }
        break;
      }
      render();
      break;
    }

    case 'apply-fix': {
      const issue = state.job.compliance?.[Number(btn.dataset.issueIdx)];
      if (!issue) return;
      const fixed = applyFix(state.job.draft, issue);
      const editedFields = { ...(state.job.draft.editedFields || {}), [issue.field]: true };
      state.job = await rt.send(MSG.JOB_UPDATE, {
        jobId: state.job.id,
        draftPatch: { title: fixed.title, description: fixed.description, editedFields },
      });
      render();
      toast(issue.field === 'description' ? '已修正內文' : '已修正標題', 'success');
      break;
    }

    case 'reset-suggested-price': {
      state.job = await rt.send(MSG.JOB_UPDATE, {
        jobId: state.job.id,
        draftPatch: { price: { final: state.job.draft.price.suggested } },
      });
      render();
      toast('已回到建議價', 'success');
      break;
    }

    case 'set-ship-mode': {
      if (!state.job?.draft) return;
      const preorderDays = Math.max(3, Number(state.brand.defaults?.daysToShip) || 10);
      const daysToShip = btn.dataset.mode === 'preorder' ? preorderDays : 2;
      state.job = await rt.send(MSG.JOB_UPDATE, { jobId: state.job.id, draftPatch: { daysToShip } });
      render();
      if (btn.dataset.mode === 'preorder') document.getElementById('daysToShip')?.focus();
      break;
    }

    case 'regenerate': {
      if (!state.job) return;
      const field = btn.dataset.field || 'all';
      const prev = state.job.draft;
      // 先留一份快照：完成後 toast 會給「還原」
      state.undo = prev
        ? { jobId: state.job.id, field, title: prev.title, description: prev.description, edited: { ...(prev.editedFields || {}) } }
        : null;
      state.job = await rt.send(MSG.JOB_REGENERATE, { jobId: state.job.id, field });
      render();
      // 真實擴充功能的 regenerate 會等到完成才回傳；mock 則透過推播完成（maybeOfferUndo 兩邊都能處理）
      maybeOfferUndo(state.job);
      break;
    }

    case 'download-cover': {
      await downloadCurrentCover();
      toast('已下載 800×800 首圖', 'success');
      break;
    }

    case 'copy-text': {
      await copyText(state.job?.draft?.description || '');
      toast('已複製內文', 'success');
      break;
    }

    case 'push-to-shopee': {
      if (!state.job) return;
      const jobId = state.job.id;
      const coverDataUrl = await renderHighResCoverDataUrl();
      const res = await rt.send(MSG.EXPORT_SHOPEE_AUTOFILL, { jobId, coverDataUrl });
      const complete = await reportAutofillResult(res);
      if (complete) markExported(jobId, 'shopee');
      break;
    }

    case 'quick-ship': {
      if (!state.job) return;
      const jobId = state.job.id;
      await copyText(buildClipboardText(state.job));
      await downloadCurrentCover();
      rt.send(MSG.TELEMETRY, { name: 'export_clipboard' });
      toast('已複製標題＋內文，並下載首圖', 'success');
      markExported(jobId, 'clipboard');
      break;
    }

    case 'delete-job': {
      const id = btn.dataset.jobId;
      if (state.pendingDeleteId !== id) {
        state.pendingDeleteId = id;
        render();
        setTimeout(() => {
          if (state.pendingDeleteId === id) {
            state.pendingDeleteId = null;
            render();
          }
        }, 3000);
        return;
      }
      state.pendingDeleteId = null;
      await rt.send(MSG.JOB_DELETE, { jobId: id });
      state.jobs = state.jobs.filter((j) => j.id !== id);
      if (state.job?.id === id) state.job = null;
      render();
      toast('已刪除這筆紀錄');
      break;
    }

    case 'open-export-menu': {
      const jobId = state.job?.id;
      openMenu(btn, [
        {
          label: '開啟原始商品頁',
          icon: 'external',
          onClick: () => state.job?.product?.url && rt.openUrl(state.job.product.url),
        },
        {
          label: '複製標題＋內文',
          icon: 'copy',
          onClick: async () => {
            await copyText(buildClipboardText(state.job));
            toast('已複製標題＋內文', 'success');
            if (jobId) markExported(jobId, 'clipboard');
          },
        },
        {
          label: '下載首圖＋全部商品圖',
          icon: 'download',
          onClick: () => downloadAllProductImages(),
        },
        {
          label: '手動上架包：複製圖文＋下載首圖',
          icon: 'clipboard',
          onClick: () => handleAction('quick-ship', btn),
        },
        'sep',
        {
          label: '下載蝦皮批次上傳檔 (.xlsx)',
          icon: 'sheet',
          onClick: () => runExcelExport('shopee-tw-mass-upload', false),
        },
        {
          label: '下載簡易清單 (.xlsx)',
          icon: 'clipboard',
          onClick: () => runExcelExport('simple', false),
        },
        {
          label: '同步至 Google Sheets',
          icon: 'link',
          onClick: () => syncToSheet(),
        },
      ]);
      break;
    }

    case 'open-batch-menu': {
      const ready = state.jobs.filter((j) => j.status === JOB_STATUS.READY);
      const pending = ready.filter((j) => !j.exportedAt);
      const items = [];
      // 預設只匯出還沒交付的，避免同一批商品重複上傳；全部匯出放在後面
      if (pending.length && pending.length < ready.length) {
        items.push(
          {
            label: `匯出尚未匯出的 ${pending.length} 件（蝦皮批次檔 .xlsx）`,
            icon: 'sheet',
            onClick: () => runExcelExport('shopee-tw-mass-upload', true, pending),
          },
          {
            label: `匯出尚未匯出的 ${pending.length} 件（簡易清單 .xlsx）`,
            icon: 'clipboard',
            onClick: () => runExcelExport('simple', true, pending),
          },
          'sep',
        );
      }
      items.push(
        {
          label: `匯出全部 ${ready.length} 件（蝦皮批次檔 .xlsx）`,
          icon: 'sheet',
          onClick: () => runExcelExport('shopee-tw-mass-upload', true, ready),
        },
        {
          label: `匯出全部 ${ready.length} 件（簡易清單 .xlsx）`,
          icon: 'clipboard',
          onClick: () => runExcelExport('simple', true, ready),
        },
      );
      openMenu(btn, items);
      break;
    }

    case 'sync-sheet': {
      await syncToSheet();
      break;
    }

    // ---------- Onboarding ----------
    case 'ob-pick-persona':
      state.brand.persona = personaFromPreset(btn.dataset.preset);
      render();
      break;
    case 'ob-pick-palette': {
      const pal = PALETTE_PRESETS.find((p) => p.id === btn.dataset.palette);
      if (pal) {
        state.brand.palette = { bg: pal.bg, fg: pal.fg, accent: pal.accent };
        render();
      }
      break;
    }
    case 'finish-onboarding': {
      if (!(state.brand.name || '').trim()) {
        document.getElementById('obBrandName')?.focus();
        return toast('先幫賣場取個名字吧', 'danger');
      }
      await rt.send(MSG.BRAND_SAVE, { brand: state.brand });
      state.settings = await rt.send(MSG.SETTINGS_SET, {
        patch: { activeBrandId: state.brand.id, onboarded: true },
      });
      rt.send(MSG.TELEMETRY, { name: 'onboarding_done', props: { mode: state.settings.mode } });
      state.route = 'home';
      render();
      toast('設定完成，開啟商品頁就能開始', 'success');
      break;
    }
  }
}

/**
 * 自動填表是脆弱的 DOM 整合（蝦皮後台隨時可能改版）：
 * 依內容腳本回報的 filled 結果決定要說「成功」還是「哪些欄位要手動補」，並自動把文字放進剪貼簿當備援。
 * @returns {Promise<boolean>} 文字與售價是否都成功帶入（用來決定要不要標記「已帶入蝦皮」）
 */
async function reportAutofillResult(res) {
  const f = res?.filled;
  const expectedImages = res?.imagesCount ?? 0;
  if (!f) {
    toast(`已開啟蝦皮新增商品頁並帶入圖文（共 ${expectedImages} 張圖片）`, 'success');
    return true;
  }
  const missing = [];
  if (!f.title) missing.push('標題');
  if (!f.description) missing.push('內文');
  if (!f.price) missing.push('售價');

  if (missing.length) {
    await copyText(buildClipboardText(state.job));
    toast(`蝦皮頁面版型可能更新了：${missing.join('、')}沒有自動填入。已把標題＋內文複製到剪貼簿，請手動貼上`, 'danger', 8000, {
      label: '下載全部圖片',
      onClick: () => downloadAllProductImages(),
    });
    rt.send(MSG.TELEMETRY, { name: 'shopee_autofill', props: { partial: true, missing } });
    return false;
  }
  if (f.uploadedImages < expectedImages) {
    toast(`已帶入標題、內文與售價，但圖片只上傳了 ${f.uploadedImages} / ${expectedImages} 張`, 'default', 7000, {
      label: '下載全部圖片',
      onClick: () => downloadAllProductImages(),
    });
    return true;
  }
  toast(`已帶入蝦皮新增商品頁（共 ${expectedImages} 張圖片），只剩「商品分類」要點選`, 'success', 4000);
  return true;
}

async function downloadCurrentCover() {
  const dataUrl = await renderHighResCoverDataUrl();
  if (!dataUrl) throw new Error('首圖尚未準備完成');
  const safeName = (state.brand.name || 'Listio').replace(/[^\w\u4e00-\u9fa5-]+/g, '_');
  await rt.download(dataUrl, `${safeName}_01_首圖.png`);
}

async function downloadAllProductImages() {
  if (!state.job?.draft) return;
  const safeName = (state.brand.name || 'Listio').replace(/[^\w\u4e00-\u9fa5-]+/g, '_');
  await downloadCurrentCover();
  const prodImgs = state.job.product?.images || [];
  let seq = 2;
  for (const idx of state.job.draft.selectedImages || []) {
    if (idx === state.job.draft.coverImageIndex) continue;
    const url = prodImgs[idx]?.hiRes || prodImgs[idx]?.url;
    if (!url) continue;
    await rt.download(url, `${safeName}_0${seq}_商品圖.jpg`);
    seq += 1;
  }
  toast(`已下載首圖與商品圖（共 ${seq - 1} 張）`, 'success');
}

async function runExcelExport(presetId, isBatch, jobsOverride = null) {
  const preset = getPreset(presetId);
  const readyJobs = state.jobs.filter((j) => j.status === JOB_STATUS.READY);
  const targetJobs = jobsOverride || (isBatch ? readyJobs : state.job ? [state.job] : readyJobs);
  if (!targetJobs.length) return toast('沒有可匯出的商品', 'danger');
  const brandsById = Object.fromEntries(state.brands.map((b) => [b.id, b]));
  const rows = buildWorkbookRows(preset, targetJobs, { brandsById });
  const fname = filenameFor(preset, targetJobs);
  await exportRowsAsExcel(rows, preset.name.slice(0, 28), fname);
  rt.send(MSG.TELEMETRY, { name: 'export_xlsx', props: { preset: preset.id, count: targetJobs.length } });
  toast(`已下載 ${fname}`, 'success');
  // 已帶入蝦皮的不要被 Excel 匯出覆蓋成「已匯出 Excel」，其餘標記為已匯出
  for (const j of targetJobs) {
    if (j.exportedVia !== 'shopee') await markExported(j.id, 'xlsx');
  }
}

async function syncToSheet() {
  if (!state.settings.gasUrl) {
    toast('請先於設定填入 Google Apps Script 網址');
    return rt.openOptions('account');
  }
  const current = state.job || state.jobs.find((j) => j.status === JOB_STATUS.READY);
  if (!current) return;
  await rt.send(MSG.EXPORT_SHEET, { jobId: current.id });
  toast('已同步至 Google Sheets', 'success');
}

async function renderHighResCoverDataUrl() {
  const existing = document.getElementById('coverCanvas');
  if (existing) return safeCanvasDataUrl(existing, (opts) => paintCover(opts));
  const current = state.job || state.jobs.find((j) => j.status === JOB_STATUS.READY);
  if (!current?.draft) return null;
  const c = document.createElement('canvas');
  c.width = 800;
  c.height = 800;
  const imgObj = current.product?.images?.[current.draft.coverImageIndex] || current.product?.images?.[0];
  const paint = async ({ forceProxy = false } = {}) => {
    const imgEl = await loadImageElement(imgObj?.hiRes || imgObj?.url, { forceProxy });
    await drawCover(c.getContext('2d'), {
      size: 800,
      template: getTemplate(current.draft.coverTemplateId),
      brand: state.brand,
      image: imgEl,
      title: current.draft.title,
      watermark: state.settings?.mode === 'cloud' && state.usage?.plan === 'free',
    });
  };
  await paint();
  return safeCanvasDataUrl(c, paint);
}

async function exportRowsAsExcel(rows, sheetName, filename) {
  if (globalThis.XLSX) {
    const ws = globalThis.XLSX.utils.aoa_to_sheet(rows);
    const colCount = rows[0]?.length || 0;
    ws['!cols'] = Array.from({ length: colCount }, (_, idx) => {
      if (idx === 1) return { wch: 36 };
      if (idx === 2) return { wch: 48 };
      return { wch: 20 };
    });
    const wb = globalThis.XLSX.utils.book_new();
    globalThis.XLSX.utils.book_append_sheet(wb, ws, sheetName);
    const buf = globalThis.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    await rt.download(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return;
  }
  const csv =
    '\uFEFF' +
    rows
      .map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  await rt.download(url, filename.replace(/\.xlsx$/, '.csv'));
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

boot();
