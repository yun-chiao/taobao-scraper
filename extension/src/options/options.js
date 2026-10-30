// Options 設定頁：直覺三步式文案設定 + 即時蝦皮文案／首圖預覽
import { MSG, DEFAULT_MODEL, PLAN_LABEL, PLAN_LIMITS, quotaRemaining } from '../shared/contract.js';
import {
  PERSONA_PRESETS,
  PERSONA_PRESET_LIST,
  PALETTE_PRESETS,
  FOOTER_SNIPPETS,
  personaFromPreset,
  newBrand,
  seedBrand,
} from '../shared/brands.js';
import { composeTitle, composeDescription } from '../shared/prompt.js';
import { computePrice, formatTwd } from '../shared/pricing.js';
import { createRuntime } from '../sidepanel/runtime.js';
import { TEMPLATES, getTemplate } from '../sidepanel/cover/templates.js';
import { drawCover } from '../sidepanel/cover/renderer.js';
import { makePreviewOrnament as makeSampleOrnament } from '../sidepanel/cover/sample-art.js';
import { html, toast, renderInto, debounce } from '../sidepanel/ui.js';

const rt = createRuntime();

const state = {
  tab: 'brand', // 'brand' | 'copy' | 'pricing' | 'account'
  settings: null,
  brands: [],
  brand: seedBrand(),
  usage: { plan: 'free', used: 0, limit: 10 },
  lastSigTitle: '實戴筆記',
  /** 自動儲存狀態：'saved' | 'dirty' | 'saving' | 'blocked' | 'error' */
  saveStatus: 'saved',
  lastSavedAt: null,
};

// ---------- 自動儲存：改完 700ms 內寫入，不需要按儲存鈕 ----------
function saveStatusText() {
  switch (state.saveStatus) {
    case 'dirty':
      return '有變更，稍後自動儲存…';
    case 'saving':
      return '儲存中…';
    case 'blocked':
      return '自備金鑰：貼上 API Key 後才會啟用（其他設定已儲存）';
    case 'error':
      return '儲存失敗，請再改一下或按 Ctrl/⌘+S 重試';
    default:
      return state.lastSavedAt
        ? `已儲存 ✓ ${new Date(state.lastSavedAt).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}`
        : '所有變更會自動儲存';
  }
}

function renderSaveStatus() {
  const el = document.getElementById('saveStatus');
  if (!el) return;
  el.textContent = saveStatusText();
  el.className = `save-status is-${state.saveStatus}`;
}

async function doSave() {
  state.saveStatus = 'saving';
  renderSaveStatus();
  try {
    await rt.send(MSG.BRAND_SAVE, { brand: state.brand });
    const patch = { ...state.settings, activeBrandId: state.brand.id, onboarded: true };
    // 自備金鑰模式但還沒貼金鑰：先不切換 mode，避免側邊欄進入「沒有金鑰」的狀態
    const keyMissing = state.settings.mode === 'byok' && !(state.settings.geminiApiKey || '').trim();
    if (keyMissing) delete patch.mode;
    const saved = await rt.send(MSG.SETTINGS_SET, { patch });
    // 保留使用者在畫面上選的 mode（尚未生效）與剛輸入的金鑰（後端回傳的是遮罩版），其餘以後端回傳為準
    state.settings = {
      ...saved,
      mode: state.settings.mode,
      geminiApiKey: saved.geminiApiKeyMasked ? state.settings.geminiApiKey : saved.geminiApiKey,
    };
    state.saveStatus = keyMissing ? 'blocked' : 'saved';
    state.lastSavedAt = Date.now();
  } catch (err) {
    state.saveStatus = 'error';
    toast(err?.message || '儲存失敗', 'danger');
  }
  renderSaveStatus();
}

const flushSave = debounce(doSave, 700);
function scheduleSave() {
  state.saveStatus = 'dirty';
  renderSaveStatus();
  flushSave();
}

async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.get('tab')) state.tab = params.get('tab');

  const [settings, brands, usage] = await Promise.all([
    rt.send(MSG.SETTINGS_GET),
    rt.send(MSG.BRAND_LIST),
    rt.send(MSG.USAGE_GET),
  ]);

  state.settings = settings;
  state.brands = brands;
  state.brand = brands.find((b) => b.id === settings.activeBrandId) || brands[0] || seedBrand();
  if (state.brand.persona?.signatureTitle) {
    state.lastSigTitle = state.brand.persona.signatureTitle;
  }
  state.usage = usage;

  bindEvents();
  render();
}

function buildLiveSampleCopy(b) {
  const preset = PERSONA_PRESETS[b.persona?.presetId] || PERSONA_PRESETS.warm;
  const sampleGen = {
    ...preset.previewGenerated,
    details: [
      { label: '顏色', value: '霧面拉絲金 / 質感亮銀' },
      { label: '尺寸', value: '約 1.2 × 0.8 cm（單只約 1.5 g）' },
    ],
    tags: ['耳針', '幾何耳環', '拉絲耳環'],
    style: b.persona?.styleTags?.[0] || '簡約',
  };
  if (b.persona?.emoji) {
    sampleGen.signature = `${sampleGen.signature} ♡`;
  }
  return {
    title: composeTitle(sampleGen, b),
    description: composeDescription(sampleGen, b),
  };
}

function syncCopyPreviewDom() {
  const titleEl = document.getElementById('livePreviewTitle');
  const descEl = document.getElementById('livePreviewDesc');
  if (!titleEl || !descEl) return;
  const { title, description } = buildLiveSampleCopy(state.brand);
  titleEl.textContent = title;
  descEl.textContent = description;
}

function render() {
  const root = document.getElementById('app');
  const b = state.brand;
  const isCopyTab = state.tab === 'copy';

  renderInto(
    root,
    html`
      <header class="opt-top">
        <div>
          <h1>賣場品牌與系統設定</h1>
        </div>
        <span class="save-status is-${state.saveStatus}" id="saveStatus" aria-live="polite">${saveStatusText()}</span>
      </header>

      <div class="brand-bar">
        ${state.brands.map(
          (item) => html`
            <button
              class="brand-pill ${item.id === b.id ? 'is-active' : ''}"
              data-action="select-brand"
              data-id="${item.id}"
            >
              <span class="brand-dot" style="--dot-color:${item.palette?.accent || '#18181b'}"></span>
              <span>${item.name}</span>
            </button>
          `,
        )}
        <button class="btn btn-ghost btn-sm" data-action="add-brand">+ 新增賣場</button>
      </div>

      <nav class="opt-tabs">
        ${[
          ['brand', '品牌與首圖'],
          ['copy', '文案與固定段落'],
          ['pricing', '定價與預設規格'],
          ['account', '方案與金鑰'],
        ].map(
          ([id, label]) => html`
            <button class="opt-tab ${state.tab === id ? 'is-active' : ''}" data-action="tab" data-tab="${id}">
              ${label}
            </button>
          `,
        )}
      </nav>

      <div class="opt-layout ${isCopyTab ? 'is-copy-tab' : ''}">
        <main>
          ${state.tab === 'brand'
            ? renderBrandSection(b)
            : state.tab === 'copy'
              ? renderCopySection(b)
              : state.tab === 'pricing'
                ? renderPricingSection(b)
                : renderAccountSection(state.settings, state.usage)}
        </main>

        <aside class="opt-preview stack">
          ${isCopyTab ? renderLiveCopyPreview(b) : renderLiveCoverPreview(b)}
        </aside>
      </div>
    `,
  );

  if (!isCopyTab) paintPreviewCanvas();
}

function renderLiveCoverPreview(b) {
  return html`
    <canvas id="optCoverPreview" width="500" height="500"></canvas>
    <div class="xs muted">
      首圖預覽（${getTemplate(b.coverTemplateId).name} · 實際輸出 800×800 PNG）
    </div>
  `;
}

function renderLiveCopyPreview(b) {
  const { title, description } = buildLiveSampleCopy(b);
  return html`
    <div class="copy-preview-card">
      <div class="copy-preview-head">
        <strong>產出效果即時預覽</strong>
        <span>以「拉絲耳針」為例</span>
      </div>
      <div class="copy-preview-body">
        <div>
          <div class="preview-block-label">蝦皮標題</div>
          <div class="preview-title-box" id="livePreviewTitle">${title}</div>
        </div>
        <div>
          <div class="preview-block-label">商品內文（上到下自動組裝）</div>
          <div class="preview-desc-box" id="livePreviewDesc">${description}</div>
        </div>
      </div>
    </div>
  `;
}

function renderBrandSection(b) {
  return html`
    <section class="opt-section stack-lg">
      <div class="row-between">
        <h3 style="margin:0;">首圖識別與配色</h3>
        ${state.brands.length > 1
          ? html`<button class="link-btn" data-action="delete-brand" style="color:var(--c-danger);">刪除此賣場</button>`
          : ''}
      </div>

      <div class="grid-2">
        <div class="field">
          <label class="field-label" for="brandName">賣場名稱（會自動加在標題最前面）</label>
          <input id="brandName" class="input" type="text" value="${b.name}" data-brand-field="name" />
        </div>
        <div class="field">
          <label class="field-label" for="brandTagline">首圖角落小字（選填）</label>
          <input id="brandTagline" class="input" type="text" value="${b.tagline || ''}" data-brand-field="tagline" />
        </div>
      </div>

      <div class="grid-2">
        <div class="field">
          <label class="field-label" for="badgeText">首圖圓章文字（可換行分兩列）</label>
          <textarea id="badgeText" class="textarea" style="min-height:66px;" data-brand-field="badgeText">${b.badgeText || ''}</textarea>
        </div>
        <div class="field">
          <span class="field-label">品牌配色</span>
          <div class="palette-dots" style="margin:4px 0 8px;">
            ${PALETTE_PRESETS.map(
              (pal) => html`
                <button
                  class="palette-dot ${b.palette?.bg === pal.bg && b.palette?.accent === pal.accent ? 'is-active' : ''}"
                  style="--p-bg:${pal.bg};--p-accent:${pal.accent};"
                  data-action="pick-palette"
                  data-palette="${pal.id}"
                  title="${pal.name}"
                ></button>
              `,
            )}
          </div>
          <div class="row">
            <input type="color" value="${b.palette.bg}" data-palette-key="bg" title="底色" />
            <input type="color" value="${b.palette.fg}" data-palette-key="fg" title="文字色" />
            <input type="color" value="${b.palette.accent}" data-palette-key="accent" title="重點色" />
            <span class="xs mono muted">${b.palette.bg} · ${b.palette.accent}</span>
          </div>
        </div>
      </div>

      <div class="field">
        <span class="field-label">預設首圖版型</span>
        <div class="choice-grid">
          ${TEMPLATES.map(
            (t) => html`
              <button
                class="choice-item ${b.coverTemplateId === t.id ? 'is-active' : ''}"
                data-action="pick-template"
                data-template="${t.id}"
              >
                <div class="choice-title">${t.name}</div>
                <div class="choice-desc">${t.description}</div>
              </button>
            `,
          )}
        </div>
      </div>
    </section>
  `;
}

function renderCopySection(b) {
  const sigEnabled = Boolean((b.persona.signatureTitle || '').trim());
  const sigPresets = ['實戴筆記', '闆娘真心話', '選品小記', '細節說明'];

  return html`
    <!-- 步驟 1：介紹口吻 -->
    <section class="opt-section">
      <h3><span class="step-badge">1</span>選擇商品介紹的說話口吻</h3>
      <p class="sec-desc">決定前半段怎麼描寫商品外觀與穿搭場景。點選不同風格，右側會直接預覽寫出來的感覺：</p>

      <div class="tone-grid">
        ${PERSONA_PRESET_LIST.map(
          (p) => html`
            <button
              class="tone-card ${b.persona.presetId === p.id ? 'is-active' : ''}"
              data-action="pick-persona"
              data-preset="${p.id}"
            >
              <div class="tone-card-head">
                <span class="tone-card-name">${p.name}</span>
              </div>
              <div class="tone-card-sub">${p.subtitle}</div>
              <div class="tone-card-sample">「${p.sample}」</div>
            </button>
          `,
        )}
      </div>

      <div class="row-between" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--c-border);">
        <span class="xs muted">表情符號習慣</span>
        <div class="tabs-inline" role="radiogroup" aria-label="表情符號習慣">
          <button class="${!b.persona.emoji ? 'is-active' : ''}" role="radio" aria-checked="${!b.persona.emoji ? 'true' : 'false'}" data-action="set-emoji" data-emoji="0">
            純文字不加符號（最乾淨）
          </button>
          <button class="${b.persona.emoji ? 'is-active' : ''}" role="radio" aria-checked="${b.persona.emoji ? 'true' : 'false'}" data-action="set-emoji" data-emoji="1">
            少量點綴（如 ♡）
          </button>
        </div>
      </div>

      <div class="field" style="margin-top:12px;">
        <label class="field-label" for="customHabit">
          <span>妳的用詞習慣或特別叮嚀（選填，寫白話即可）</span>
        </label>
        <input
          id="customHabit"
          class="input"
          type="text"
          placeholder="例如：把「耳釘」一律寫成「耳針」、不要用驚嘆號、每篇都提到附贈絨布袋"
          value="${b.persona.customPrompt || ''}"
          data-persona-field="customPrompt"
        />
      </div>
    </section>

    <!-- 步驟 2：實戴／選品心得小段 -->
    <section class="opt-section">
      <div class="row-between" style="margin-bottom:4px;">
        <h3 style="margin:0;"><span class="step-badge">2</span>店長實戴／選品心得段落</h3>
        <div class="tabs-inline" role="radiogroup" aria-label="是否顯示心得段落">
          <button class="${sigEnabled ? 'is-active' : ''}" role="radio" aria-checked="${sigEnabled ? 'true' : 'false'}" data-action="toggle-sig" data-on="1">顯示</button>
          <button class="${!sigEnabled ? 'is-active' : ''}" role="radio" aria-checked="${!sigEnabled ? 'true' : 'false'}" data-action="toggle-sig" data-on="0">不顯示</button>
        </div>
      </div>
      <p class="sec-desc">夾在商品介紹與規格表中間，用第一人稱補充配戴體感或挑選原因，讓內文不像機器罐頭稿。</p>

      ${sigEnabled
        ? html`
            <div class="field">
              <div class="field-label">
                <label for="sigTitle">這一段的小標題</label>
                <div class="row" style="gap:4px;">
                  ${sigPresets.map(
                    (label) => html`
                      <button
                        class="snippet-btn"
                        data-action="set-sig-title"
                        data-title="${label}"
                      >
                        ${label}
                      </button>
                    `,
                  )}
                </div>
              </div>
              <input
                id="sigTitle"
                class="input"
                type="text"
                placeholder="例如：實戴筆記、Mimi 私心說"
                value="${b.persona.signatureTitle}"
                data-persona-field="signatureTitle"
              />
            </div>
          `
        : html`<div class="xs muted">目前已關閉此段落，內文將直接由「商品介紹」接「商品規格」。</div>`}
    </section>

    <!-- 步驟 3：賣場固定頁尾 -->
    <section class="opt-section">
      <h3><span class="step-badge">3</span>賣場固定頁尾（每篇內文最底下自動附上）</h3>
      <p class="sec-desc">把出貨天數、保養方式或退換貨規則寫在這裡一次就好，之後每件新商品都會自動貼在最末段。</p>

      <div class="snippet-bar">
        <span class="xs muted">快速插入範本：</span>
        ${FOOTER_SNIPPETS.map(
          (s, idx) => html`
            <button class="snippet-btn" data-action="insert-footer-snippet" data-idx="${idx}">
              + ${s.label}
            </button>
          `,
        )}
      </div>

      <div class="field">
        <textarea
          id="shippingNote"
          class="textarea"
          style="min-height:110px;"
          placeholder="例如：現貨 2 日內寄出，預購約 7–12 個工作天…"
          data-brand-field="shippingNote"
        >${b.shippingNote}</textarea>
      </div>

      <details class="more-drawer" id="optStyleTagsDrawer">
        <summary>進階：蝦皮標題常用風格詞</summary>
        <div class="field" style="margin-top:8px;">
          <label class="field-label" for="styleTags">
            產生標題時會自動從裡面挑 1 個適合該商品的詞放進標題（以頓號分隔）
          </label>
          <input
            id="styleTags"
            class="input"
            type="text"
            value="${(b.persona.styleTags || []).join('、')}"
            data-persona-tags="1"
          />
        </div>
      </details>
    </section>
  `;
}

function renderPricingSection(b) {
  const sample = computePrice({ ...b.pricing, costCny: 58, suggested: null, final: null });
  return html`
    <section class="opt-section stack-lg">
      <div class="row-between">
        <h3 style="margin:0;">人民幣轉台幣定價規則</h3>
        <span class="xs muted">試算：¥58 → ${formatTwd(sample.suggested)}</span>
      </div>

      <div class="grid-2">
        <div class="field">
          <label class="field-label" for="prRate">人民幣匯率</label>
          <input id="prRate" class="input" type="number" step="0.05" value="${b.pricing.rate}" data-pricing-num="rate" />
        </div>
        <div class="field">
          <label class="field-label" for="prShip">單件國際運費分攤 (NT$)</label>
          <input id="prShip" class="input" type="number" step="5" value="${b.pricing.shippingTwd}" data-pricing-num="shippingTwd" />
        </div>
        <div class="field">
          <label class="field-label" for="prFee">平台手續費＋金流費率 (%)</label>
          <input id="prFee" class="input" type="number" step="1" value="${Math.round(b.pricing.feeRate * 100)}" data-pricing-pct="feeRate" />
        </div>
        <div class="field">
          <label class="field-label" for="prMargin">目標毛利率 (%)</label>
          <input id="prMargin" class="input" type="number" step="1" value="${Math.round(b.pricing.marginRate * 100)}" data-pricing-pct="marginRate" />
        </div>
      </div>
    </section>

    <section class="opt-section stack-lg">
      <h3>蝦皮上傳預設值</h3>
      <div class="grid-2">
        <div class="field">
          <label class="field-label" for="defDays">預設出貨天數（>2 為較長備貨）</label>
          <input id="defDays" class="input" type="number" value="${b.defaults.daysToShip}" data-default-num="daysToShip" />
        </div>
        <div class="field">
          <label class="field-label" for="defStock">預設庫存</label>
          <input id="defStock" class="input" type="number" value="${b.defaults.stock}" data-default-num="stock" />
        </div>
        <div class="field">
          <label class="field-label" for="defWeight">預設重量 (kg)</label>
          <input id="defWeight" class="input" type="number" step="0.01" value="${b.defaults.weightKg}" data-default-num="weightKg" />
        </div>
        <div class="field">
          <label class="field-label" for="defCat">預設蝦皮分類代碼</label>
          <input id="defCat" class="input" type="text" placeholder="選填" value="${b.defaults.categoryId || ''}" data-default-str="categoryId" />
        </div>
      </div>
    </section>
  `;
}

function renderAccountSection(s, usage) {
  const isByok = s.mode === 'byok';
  const left = quotaRemaining(usage);
  const isLifetime = (usage.period || 'lifetime') === 'lifetime';
  const usageText = isByok
    ? '目前使用自備金鑰 · 不限件數'
    : isLifetime
      ? `免費方案 · 終身 ${usage.limit} 件，已用 ${usage.used} 件（還可產生 ${left} 件）`
      : `${PLAN_LABEL[usage.plan] || usage.plan} · 本月 ${usage.used} / ${usage.limit} 件`;
  const currentPlan = isByok ? null : usage.plan || 'free';

  return html`
    <section class="opt-section stack-lg">
      <div class="row-between">
        <h3 style="margin:0;">方案與用量</h3>
        <span class="xs muted">${usageText}</span>
      </div>
      <div class="plan-table">
        <div class="plan-box ${currentPlan === 'free' ? 'is-current' : ''}">
          <strong>Free</strong>
          <div class="plan-price">NT$0 <span>· 不需註冊</span></div>
          <p class="xs muted">終身 ${PLAN_LIMITS.free} 件 · 1 個賣場 · 首圖小浮水印</p>
          ${currentPlan === 'free' ? html`<div class="xs subtle" style="margin-top:auto;">目前方案</div>` : ''}
        </div>
        <div class="plan-box ${currentPlan === 'pro' ? 'is-current' : ''}">
          <strong>Pro</strong>
          <div class="plan-price">NT$390 <span>/月</span></div>
          <p class="xs muted">每月 ${PLAN_LIMITS.pro} 件 · 3 個賣場 · 無浮水印 · 批次匯出</p>
          <button class="btn btn-primary btn-sm" data-action="upgrade" data-plan="pro" style="margin-top:auto;">選擇 Pro</button>
        </div>
        <div class="plan-box ${currentPlan === 'studio' ? 'is-current' : ''}">
          <strong>Studio</strong>
          <div class="plan-price">NT$990 <span>/月</span></div>
          <p class="xs muted">每月 ${PLAN_LIMITS.studio} 件 · 不限賣場 · Google Sheets 同步</p>
          <button class="btn btn-secondary btn-sm" data-action="upgrade" data-plan="studio" style="margin-top:auto;">選擇 Studio</button>
        </div>
      </div>
    </section>

    <section class="opt-section stack">
      <div class="row-between">
        <h3 style="margin:0;">進階：自備 Gemini 金鑰</h3>
        <div class="tabs-inline" role="radiogroup" aria-label="連線方式">
          <button class="${!isByok ? 'is-active' : ''}" role="radio" aria-checked="${!isByok ? 'true' : 'false'}" data-action="set-mode" data-mode="cloud">
            使用 Listio 雲端（預設）
          </button>
          <button class="${isByok ? 'is-active' : ''}" role="radio" aria-checked="${isByok ? 'true' : 'false'}" data-action="set-mode" data-mode="byok">
            自備 API Key
          </button>
        </div>
      </div>
      <p class="sec-desc">
        用你自己的 Google AI Studio 金鑰直接呼叫 Gemini：不經過 Listio、不計入件數，費用由 Google 依你的用量計算（一般小量使用多在 Google 的免費額度內）。金鑰只存在這台電腦的瀏覽器裡。
      </p>

      ${isByok
        ? html`
            <div class="field">
              <div class="field-label">
                <label for="apiKeyInput">Gemini API Key</label>
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">到 Google AI Studio 建立金鑰 ↗</a>
              </div>
              <div class="row">
                <input
                  id="apiKeyInput"
                  class="input mono"
                  type="password"
                  value="${s.geminiApiKey || ''}"
                  placeholder="AIzaSy..."
                  data-setting-field="geminiApiKey"
                />
                <button class="btn btn-secondary" data-action="test-key">測試</button>
              </div>
            </div>

            <div class="field">
              <label class="field-label" for="modelInput">模型名稱</label>
              <input
                id="modelInput"
                class="input mono"
                type="text"
                value="${s.model || DEFAULT_MODEL}"
                data-setting-field="model"
              />
            </div>
          `
        : html`<div class="xs muted">目前使用 Listio 雲端，不需要金鑰。切到「自備 API Key」後，這裡會出現金鑰欄位。</div>`}
    </section>

    <section class="opt-section stack">
      <h3>Google Sheets 同步（選填）</h3>
      <div class="field">
        <label class="field-label" for="gasUrlInput">Google Apps Script 網址（/exec 結尾）</label>
        <input
          id="gasUrlInput"
          class="input mono"
          type="url"
          placeholder="https://script.google.com/macros/s/.../exec"
          value="${s.gasUrl || ''}"
          data-setting-field="gasUrl"
        />
      </div>
    </section>
  `;
}

async function paintPreviewCanvas() {
  const c = document.getElementById('optCoverPreview');
  if (!c) return;
  const sampleImg = makePreviewOrnament();
  await drawCover(c.getContext('2d'), {
    size: 500,
    template: getTemplate(state.brand.coverTemplateId),
    brand: state.brand,
    image: sampleImg,
    title: `${state.brand.name}｜弧面摺疊霧面拉絲耳針 簡約日常耳環`,
    watermark: false,
  });
  globalThis.__optionsReady = true;
}

function makePreviewOrnament() {
  return makeSampleOrnament(400);
}

function bindEvents() {
  document.body.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'tab') {
      state.tab = btn.dataset.tab;
      render();
    } else if (action === 'select-brand') {
      const found = state.brands.find((b) => b.id === btn.dataset.id);
      if (found) {
        state.brand = found;
        await rt.send(MSG.SETTINGS_SET, { patch: { activeBrandId: found.id } });
        render();
      }
    } else if (action === 'add-brand') {
      const created = newBrand({ name: `賣場 ${state.brands.length + 1}` });
      await rt.send(MSG.BRAND_SAVE, { brand: created });
      state.brands.push(created);
      state.brand = created;
      render();
      toast('已新增賣場', 'success');
    } else if (action === 'delete-brand') {
      await rt.send(MSG.BRAND_DELETE, { brandId: state.brand.id });
      state.brands = await rt.send(MSG.BRAND_LIST);
      state.brand = state.brands[0];
      render();
      toast('已刪除賣場');
    } else if (action === 'pick-palette') {
      const pal = PALETTE_PRESETS.find((p) => p.id === btn.dataset.palette);
      if (pal) {
        state.brand.palette = { bg: pal.bg, fg: pal.fg, accent: pal.accent };
        render();
      }
    } else if (action === 'pick-template') {
      state.brand.coverTemplateId = btn.dataset.template;
      render();
    } else if (action === 'pick-persona') {
      const prevCustom = state.brand.persona.customPrompt || '';
      const prevEmoji = state.brand.persona.emoji;
      const keepEmptySig = !(state.brand.persona.signatureTitle || '').trim();
      const nextPersona = personaFromPreset(btn.dataset.preset);
      nextPersona.customPrompt = prevCustom;
      nextPersona.emoji = prevEmoji;
      if (keepEmptySig) nextPersona.signatureTitle = '';
      else state.lastSigTitle = nextPersona.signatureTitle;
      state.brand.persona = nextPersona;
      render();
    } else if (action === 'set-emoji') {
      state.brand.persona.emoji = btn.dataset.emoji === '1';
      render();
    } else if (action === 'toggle-sig') {
      const turnOn = btn.dataset.on === '1';
      if (turnOn) {
        state.brand.persona.signatureTitle = state.lastSigTitle || '實戴筆記';
      } else {
        if (state.brand.persona.signatureTitle) state.lastSigTitle = state.brand.persona.signatureTitle;
        state.brand.persona.signatureTitle = '';
      }
      render();
    } else if (action === 'set-sig-title') {
      state.brand.persona.signatureTitle = btn.dataset.title;
      state.lastSigTitle = btn.dataset.title;
      render();
    } else if (action === 'insert-footer-snippet') {
      const snippet = FOOTER_SNIPPETS[Number(btn.dataset.idx)];
      if (!snippet) return;
      const cur = (state.brand.shippingNote || '').trim();
      if (cur.includes(snippet.text)) return toast('頁尾已包含此說明');
      state.brand.shippingNote = cur ? `${cur}\n${snippet.text}` : `【購買與出貨須知】\n${snippet.text}`;
      render();
      toast(`已加入「${snippet.label}」`);
    } else if (action === 'set-mode') {
      state.settings.mode = btn.dataset.mode;
      render();
    } else if (action === 'test-key') {
      try {
        const res = await rt.send(MSG.SETTINGS_TEST_KEY, {
          apiKey: state.settings.geminiApiKey,
          model: state.settings.model,
        });
        toast(`連線正常（${res.model}）`, 'success');
      } catch (err) {
        toast(err.message || '測試失敗', 'danger');
      }
    } else if (action === 'save-all') {
      await doSave();
      if (state.saveStatus === 'saved') toast('已儲存設定', 'success');
    } else if (action === 'upgrade') {
      toast(`已開啟 ${btn.dataset.plan.toUpperCase()} 結帳頁面`, 'success');
    }

    // 會改到品牌／設定內容的操作 → 排程自動儲存（新增／刪除／切換賣場已各自即時寫入）
    if (AUTOSAVE_ACTIONS.has(action)) scheduleSave();
  });

  document.body.addEventListener('input', (e) => {
    const el = e.target;
    let changed = true;
    if (el.dataset.brandField) {
      state.brand[el.dataset.brandField] = el.value;
      paintPreviewCanvas();
      syncCopyPreviewDom();
    } else if (el.dataset.paletteKey) {
      state.brand.palette[el.dataset.paletteKey] = el.value;
      paintPreviewCanvas();
    } else if (el.dataset.personaField) {
      state.brand.persona[el.dataset.personaField] = el.value;
      if (el.dataset.personaField === 'signatureTitle' && el.value.trim()) {
        state.lastSigTitle = el.value.trim();
      }
      syncCopyPreviewDom();
    } else if (el.dataset.personaTags) {
      state.brand.persona.styleTags = el.value
        .split(/[、,，\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      syncCopyPreviewDom();
    } else if (el.dataset.pricingNum) {
      state.brand.pricing[el.dataset.pricingNum] = Number(el.value);
    } else if (el.dataset.pricingPct) {
      state.brand.pricing[el.dataset.pricingPct] = Number(el.value) / 100;
    } else if (el.dataset.defaultNum) {
      state.brand.defaults[el.dataset.defaultNum] = Number(el.value);
    } else if (el.dataset.defaultStr) {
      state.brand.defaults[el.dataset.defaultStr] = el.value.trim();
    } else if (el.dataset.settingField) {
      state.settings[el.dataset.settingField] = el.value.trim();
    } else {
      changed = false;
    }
    if (changed) scheduleSave();
  });

  // Ctrl/⌘+S 立即儲存（習慣動作），關閉分頁前把未寫入的變更送出
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      doSave().then(() => state.saveStatus === 'saved' && toast('已儲存設定', 'success'));
    }
  });
  window.addEventListener('beforeunload', () => {
    if (state.saveStatus === 'dirty') doSave();
  });
}

const AUTOSAVE_ACTIONS = new Set([
  'pick-palette',
  'pick-template',
  'pick-persona',
  'set-emoji',
  'toggle-sig',
  'set-sig-title',
  'insert-footer-snippet',
  'set-mode',
]);

boot();
