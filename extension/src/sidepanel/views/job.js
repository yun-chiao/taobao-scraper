// Side Panel 單頁完稿工作台：首圖、文案、定價與一鍵複製／匯出整合在同一畫面
import { JOB_STATUS, SHOPEE_TITLE_MAX, PREORDER_THRESHOLD_DAYS, EXPORT_VIA_LABEL } from '../../shared/contract.js';
import { formatTwd, profitAt } from '../../shared/pricing.js';
import { html, icon, charCount, timeAgo } from '../ui.js';

const SHORT_TPL_LABELS = {
  'badge-classic': '圓章',
  editorial: '雜誌',
  polaroid: '拍立得',
  bold: '滿版',
};

export const isPreorderDraft = (draft) => (draft?.daysToShip || 0) > PREORDER_THRESHOLD_DAYS;

/** 售價列下的一行摘要：成本 · 這件實賺多少 · 現貨／預購。 */
export function formatPriceSub(draft) {
  const parts = [];
  if (draft.price?.costCny != null && draft.price.costCny !== '') parts.push(`成本 ¥${draft.price.costCny}`);
  const p = profitAt(draft.price);
  if (p) {
    parts.push(
      p.profitTwd < 0
        ? `每件虧 $${Math.abs(p.profitTwd)}`
        : `實賺約 $${p.profitTwd}（${Math.round(p.marginRate * 100)}%）`,
    );
  }
  parts.push(isPreorderDraft(draft) ? `預購 ${draft.daysToShip} 天` : '現貨 2 天內');
  return parts.join(' · ');
}

/** 摘要的語氣：虧錢 → danger；毛利 < 15% → warn。 */
export function priceSubTone(draft) {
  const p = profitAt(draft?.price);
  if (!p) return '';
  if (p.profitTwd < 0) return 'is-danger';
  if (p.marginRate < 0.15) return 'is-warn';
  return '';
}

export function formatFormulaNote(price) {
  const cost = Number(price?.costCny);
  if (!Number.isFinite(cost) || cost <= 0 || !price?.suggested) {
    return '輸入人民幣成本後，自動依匯率、運費、平台抽成與毛利率試算建議售價。';
  }
  const rate = price.rate || 4.6;
  const ship = price.shippingTwd ?? 25;
  const feePct = Math.round((price.feeRate ?? 0.1) * 100);
  const marginPct = Math.round((price.marginRate ?? 0.35) * 100);
  const baseTwd = Math.round(cost * rate + ship);
  const finalPrice = price.final || price.suggested;
  const estProfit = Math.round(finalPrice - (cost * rate + ship) - finalPrice * (price.feeRate ?? 0.1));
  return `商品台幣約 $${Math.round(cost * rate)}（¥${cost}×${rate}）＋運費 $${ship}＝總成本 $${baseTwd}；扣除蝦皮抽成 ${feePct}%、預留 ${marginPct}% 毛利 → 建議價 ${formatTwd(price.suggested)}（單件實賺約 $${estProfit}）`;
}

/** 售價被手動改過且與建議價不同時，顯示「回到建議價」。 */
export function suggestHint(price) {
  const s = price?.suggested;
  const f = price?.final;
  if (!s || f == null || Number(f) === Number(s)) return '';
  return `回到建議價 ${formatTwd(s)}`;
}

/** 依錯誤碼決定錯誤列的主要行動（而不是一律「重試」）。 */
export function errorPrimaryAction(code) {
  switch (code) {
    case 'NO_API_KEY':
      return { label: '前往設定', action: 'open-options', tab: 'account' };
    case 'QUOTA_EXCEEDED':
      return { label: '升級方案', action: 'upgrade' };
    case 'UNSUPPORTED_PAGE':
    case 'EXTRACT_EMPTY':
      return { label: '回報此頁', action: 'report-page' };
    default:
      return { label: '重試', action: 'regenerate' };
  }
}

/** 把合規問題依欄位分組，讓提示出現在它所指的欄位下面。 */
export function groupIssues(compliance = []) {
  const groups = { title: [], description: [], price: [], images: [], general: [] };
  compliance.forEach((issue, idx) => {
    const key = groups[issue.field] ? issue.field : 'general';
    groups[key].push({ issue, idx });
  });
  return groups;
}

export function renderIssueList(items, { skipInfo = true } = {}) {
  return items
    .filter(({ issue }) => !(skipInfo && issue.level === 'info'))
    .map(
      ({ issue, idx }) => html`
        <div class="inline-issue ${issue.level === 'warn' ? 'is-warn' : ''}">
          <span>${issue.message}</span>
          ${issue.fix != null
            ? html`<button class="link-btn" data-action="apply-fix" data-issue-idx="${idx}">修正</button>`
            : ''}
        </div>
      `,
    );
}

function renderErrorLine(error) {
  const primary = errorPrimaryAction(error.code);
  const secondary = errorSecondaryAction(error.code);
  return html`
    <div class="status-line is-error">
      <div class="status-body">
        <div>${error.message}</div>
        ${error.hint ? html`<div class="status-hint">${error.hint}</div>` : ''}
      </div>
      <div class="status-actions">
        <button
          class="btn btn-secondary btn-sm"
          data-action="${primary.action}"
          data-field="all"
          ${primary.tab ? html`data-tab="${primary.tab}"` : ''}
        >
          ${primary.label}
        </button>
        ${secondary
          ? html`<button class="link-btn" data-action="${secondary.action}" data-field="all" ${secondary.tab ? html`data-tab="${secondary.tab}"` : ''}>${secondary.label}</button>`
          : ''}
      </div>
    </div>
  `;
}

/** 次要出路：連不上雲端時給「改用自備金鑰」；主按鈕不是「重試」時補一個「重試」。 */
export function errorSecondaryAction(code) {
  if (code === 'UNAUTHENTICATED' || code === 'NETWORK') {
    return { label: '改用自備金鑰', action: 'open-options', tab: 'account' };
  }
  return errorPrimaryAction(code).action === 'regenerate' ? null : { label: '重試', action: 'regenerate' };
}

/** 擷取中（還沒有商品資料）：整頁佔位。 */
function renderExtractingSkeleton(label) {
  return html`
    <section class="panel" aria-busy="true">
      <div class="cover-stage skeleton-box" style="border:0;"></div>
      <div class="skeleton-line" style="width:68%;margin-top:12px;"></div>
      <div class="skeleton-line" style="width:42%;"></div>
    </section>
    <section class="panel stack" aria-busy="true">
      <div class="skeleton-line" style="width:22%;"></div>
      <div class="skeleton-box"></div>
      <div class="skeleton-line" style="width:22%;"></div>
      <div class="skeleton-box" style="min-height:120px;"></div>
    </section>
    <div class="bottom-bar">
      <button class="btn btn-primary btn-main" disabled><span class="spinner"></span> ${label || '擷取商品資料'}…</button>
    </div>
  `;
}

export function renderJobView(state) {
  const { job, brand } = state;
  if (!job) return html`<section class="panel"><div class="source-empty">找不到這筆商品紀錄</div></section>`;

  const isRunning = job.status === JOB_STATUS.EXTRACTING || job.status === JOB_STATUS.GENERATING;
  const draft = job.draft;
  const product = job.product;
  // 第一次生成（還沒有任何 AI 文案）→ 文字欄位用佔位；重寫（已有舊文案）→ 欄位保留但鎖定
  const isFirstGeneration = isRunning && !job.generated;
  const isRewriting = isRunning && Boolean(job.generated);
  const issues = groupIssues(job.compliance);
  const edited = draft?.editedFields || {};
  const selectedCount = draft?.selectedImages?.length || 0;

  return html`
    <div class="nav-row">
      <button class="back-link" data-action="nav-home">${icon('back')}<span>返回</span></button>
      <span class="row" style="gap:10px;">
        ${!isRunning && job.exportedVia
          ? html`<span class="exported-tag" title="${new Date(job.exportedAt).toLocaleString('zh-TW')}">${icon('check')}${EXPORT_VIA_LABEL[job.exportedVia] || '已交付'} · ${timeAgo(job.exportedAt)}</span>`
          : ''}
        ${isRunning
          ? html`<span class="row xs muted"><span class="spinner"></span><span>${job.progress?.label || '正在產生文案'}…</span></span>`
          : html`<button class="link-btn" data-action="regenerate" data-field="all">全部重寫</button>`}
      </span>
    </div>

    ${job.error ? renderErrorLine(job.error) : ''}

    ${!draft
      ? job.error
        ? ''
        : renderExtractingSkeleton(job.progress?.label)
      : html`
          <!-- 1. 首圖與商品圖 -->
          <section class="panel">
            <div class="cover-stage">
              <canvas id="coverCanvas" width="800" height="800"></canvas>
            </div>

            <div class="cover-bar">
              <div class="tabs-inline" role="radiogroup" aria-label="首圖版型">
                ${Object.entries(SHORT_TPL_LABELS).map(
                  ([id, label]) => html`
                    <button
                      class="${draft.coverTemplateId === id ? 'is-active' : ''}"
                      role="radio"
                      aria-checked="${draft.coverTemplateId === id ? 'true' : 'false'}"
                      data-action="pick-template"
                      data-template-id="${id}"
                    >
                      ${label}
                    </button>
                  `,
                )}
              </div>
              <button class="btn btn-ghost btn-sm" data-action="download-cover" ${isFirstGeneration ? 'disabled' : ''}>
                ${icon('download')} 下載首圖
              </button>
            </div>

            ${product?.images?.length > 1
              ? html`
                  <div class="photo-strip-head">
                    <span>點圖片換首圖底圖 · 勾選要上傳的圖</span>
                    <span class="tabular">${selectedCount} / 9</span>
                  </div>
                  <div class="photo-strip" aria-label="商品圖片">
                    ${product.images.map((img, idx) => {
                      const isSelected = draft.selectedImages.includes(idx);
                      const isCover = draft.coverImageIndex === idx;
                      return html`
                        <div class="photo-item ${isSelected ? 'is-selected' : ''} ${isCover ? 'is-cover' : ''}">
                          <button
                            class="photo-pick"
                            type="button"
                            data-action="set-cover-image"
                            data-index="${idx}"
                            title="設為首圖底圖"
                            aria-label="商品圖 ${idx + 1}，設為首圖底圖"
                          >
                            <img src="${img.hiRes || img.url}" alt="" />
                          </button>
                          ${isCover ? html`<span class="photo-cover-tag">首圖</span>` : ''}
                          <button
                            class="photo-check"
                            type="button"
                            data-action="toggle-image"
                            data-index="${idx}"
                            title="${isSelected ? '取消上傳這張' : '上傳這張'}"
                            aria-pressed="${isSelected ? 'true' : 'false'}"
                          >
                            ✓
                          </button>
                        </div>
                      `;
                    })}
                  </div>
                  ${renderIssueList(issues.images)}
                `
              : ''}
          </section>

          <!-- 2. 標題與內文 -->
          <section class="panel stack">
            <div class="field">
              <div class="field-label">
                <label for="draftTitle">蝦皮標題${isRewriting ? html`<span class="subtle"> · 重寫中…</span>` : ''}</label>
                <span class="field-tools">
                  ${!isRunning
                    ? html`<button class="link-btn" data-action="regenerate" data-field="title">換一個標題</button>`
                    : ''}
                  ${!isFirstGeneration
                    ? html`<span class="field-counter ${charCount(draft.title) > SHOPEE_TITLE_MAX ? 'is-over' : ''}">
                        ${charCount(draft.title)} / ${SHOPEE_TITLE_MAX}
                      </span>`
                    : ''}
                </span>
              </div>
              ${isFirstGeneration
                ? html`<div class="skeleton-box" style="min-height:38px;" aria-busy="true"></div>`
                : html`
                    <input
                      id="draftTitle"
                      class="input ${issues.title.some(({ issue }) => issue.level === 'block') ? 'is-invalid' : ''}"
                      type="text"
                      value="${draft.title}"
                      data-draft-field="title"
                      ${isRewriting ? 'disabled' : ''}
                    />
                    ${renderIssueList(issues.title)}
                  `}
            </div>

            <div class="claims-row">
              <span class="claims-label">材質標示</span>
              ${[
                ['silver925', '925 純銀'],
                ['gold18k', '18K 金'],
                ['steel316', '316L 鋼'],
                ['natural', '天然珍珠'],
              ].map(
                ([key, label]) => html`
                  <button
                    class="toggle-pill ${brand?.materialClaims?.[key] ? 'is-active' : ''}"
                    data-action="toggle-claim"
                    data-claim="${key}"
                    aria-pressed="${brand?.materialClaims?.[key] ? 'true' : 'false'}"
                  >
                    ${label}
                  </button>
                `,
              )}
            </div>

            <div class="field">
              <div class="field-label">
                <label for="draftDescription">商品內文${isRewriting ? html`<span class="subtle"> · 重寫中…</span>` : ''}</label>
                <span class="field-tools">
                  ${!isRunning
                    ? html`<button class="link-btn" data-action="regenerate" data-field="description">換一版內文</button>`
                    : ''}
                  ${!isFirstGeneration ? html`<button class="link-btn" data-action="copy-text">複製內文</button>` : ''}
                </span>
              </div>
              ${isFirstGeneration
                ? html`
                    <div class="skeleton-box" style="min-height:150px;" aria-busy="true"></div>
                    <div class="xs subtle">AI 正在用你設定的口吻撰寫，約需 10–20 秒。這段時間可以先挑首圖、調整售價。</div>
                  `
                : html`
                    <textarea
                      id="draftDescription"
                      class="textarea autogrow ${issues.description.some(({ issue }) => issue.level === 'block') ? 'is-invalid' : ''}"
                      data-draft-field="description"
                      ${isRewriting ? 'disabled' : ''}
                    >${draft.description}</textarea>
                    ${renderIssueList(issues.description)}
                  `}
            </div>
          </section>

          <!-- 3. 售價與備貨明細 -->
          ${renderPricePanel(draft, state.priceDrawerOpen, issues)}

          <!-- 底部固定操作列 -->
          <div class="bottom-bar">
            ${isRunning
              ? html`
                  <button class="btn btn-primary btn-main" disabled>
                    <span class="spinner"></span> ${job.progress?.label || '產生中'}…
                  </button>
                `
              : html`
                  <button class="btn btn-primary btn-main" data-action="push-to-shopee">
                    ${icon('external')} ${job.exportedVia === 'shopee' ? '再帶入蝦皮一次' : '一鍵帶入蝦皮後台'}
                  </button>
                `}
            <button class="btn btn-secondary" data-action="open-export-menu" ${isFirstGeneration ? 'disabled' : ''}>
              更多 ${icon('chevron')}
            </button>
          </div>
        `}
  `;
}

function renderPricePanel(draft, isOpen = false, issues = groupIssues([])) {
  const priceBlocked = issues.price.some(({ issue }) => issue.level === 'block');
  const hint = suggestHint(draft.price);
  const preorder = isPreorderDraft(draft);
  return html`
    <section class="panel">
      <div class="price-bar">
        <div class="price-label">
          <strong>刊登售價</strong>
          <span class="price-sub ${priceSubTone(draft)}" id="priceSubText">${formatPriceSub(draft)}</span>
          <button class="link-btn price-suggest" id="priceSuggestBtn" data-action="reset-suggested-price" ${hint ? '' : 'hidden'}>
            ${hint}
          </button>
        </div>
        <div class="price-edit">
          <span class="price-prefix">NT$</span>
          <input
            id="draftFinalPrice"
            class="input price-input ${priceBlocked ? 'is-invalid' : ''}"
            type="number"
            value="${draft.price.final ?? ''}"
            data-price-field="final"
            aria-label="刊登售價"
          />
        </div>
      </div>
      <div id="priceIssues">${renderIssueList(issues.price)}</div>

      <details class="more-drawer" id="priceDrawer" ${isOpen ? 'open' : ''}>
        <summary>調整成本、運費、毛利率與出貨方式</summary>
        <div class="drawer-grid">
          <div class="field">
            <label class="field-label" for="costCny">人民幣成本 (¥)</label>
            <input
              id="costCny"
              class="input"
              type="number"
              step="0.5"
              min="0"
              value="${draft.price.costCny ?? ''}"
              data-price-field="costCny"
            />
          </div>
          <div class="field">
            <label class="field-label" for="shippingTwd">單件運費分攤 (NT$)</label>
            <input
              id="shippingTwd"
              class="input"
              type="number"
              step="5"
              min="0"
              value="${draft.price.shippingTwd ?? 25}"
              data-price-field="shippingTwd"
            />
          </div>
          <div class="field">
            <label class="field-label" for="marginPct">目標毛利率 (%)</label>
            <input
              id="marginPct"
              class="input"
              type="number"
              step="5"
              min="0"
              max="80"
              value="${Math.round((draft.price.marginRate ?? 0.35) * 100)}"
              data-price-pct="marginRate"
            />
          </div>
          <div class="field">
            <span class="field-label">出貨方式</span>
            <div class="tabs-inline ship-mode" role="radiogroup" aria-label="出貨方式">
              <button
                role="radio"
                aria-checked="${preorder ? 'false' : 'true'}"
                class="${preorder ? '' : 'is-active'}"
                data-action="set-ship-mode"
                data-mode="stock"
              >
                現貨 · 2 天內
              </button>
              <button
                role="radio"
                aria-checked="${preorder ? 'true' : 'false'}"
                class="${preorder ? 'is-active' : ''}"
                data-action="set-ship-mode"
                data-mode="preorder"
              >
                預購
              </button>
            </div>
          </div>
          ${preorder
            ? html`
                <div class="field">
                  <label class="field-label" for="daysToShip">預購約幾個工作天出貨</label>
                  <input
                    id="daysToShip"
                    class="input"
                    type="number"
                    min="3"
                    max="30"
                    value="${draft.daysToShip ?? 10}"
                    data-draft-num="daysToShip"
                  />
                </div>
              `
            : ''}
        </div>
        <div class="xs muted" id="priceFormulaNote" style="margin-top:10px;line-height:1.55;">
          ${formatFormulaNote(draft.price)}
        </div>
      </details>
      ${issues.general.filter(({ issue }) => issue.level !== 'info').length
        ? html`<div class="general-issues">${renderIssueList(issues.general)}</div>`
        : ''}
    </section>
  `;
}
