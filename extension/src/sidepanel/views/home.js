// Side Panel 首頁：乾淨的商品偵測面板 + 一鍵產生 + 極簡歷史列表
import { SITE_LABEL, JOB_STATUS, EXPORT_VIA_LABEL, quotaRemaining, findJobForUrl } from '../../shared/contract.js';
import { formatTwd } from '../../shared/pricing.js';
import { html, icon, timeAgo } from '../ui.js';

/**
 * CTA 下方的額度一行字。雲端免費方案為終身件數；付費方案為月額度；自備金鑰不限。
 * @returns {{text: string, tone: 'muted'|'warn'|'danger', exhausted: boolean}}
 */
export function describeQuota(settings, usage) {
  if (settings?.mode === 'byok') {
    return { text: '自備 Gemini 金鑰 · 不限件數', tone: 'muted', exhausted: false };
  }
  if (!usage || typeof usage.limit !== 'number') {
    // 尚未取得用量（例如剛開啟、後端暫時不可用）：不要誤判成已用完
    return { text: '', tone: 'muted', exhausted: false };
  }
  const left = quotaRemaining(usage);
  const isLifetime = (usage?.period || 'lifetime') === 'lifetime';
  if (left === 0) {
    return {
      text: isLifetime ? `免費 ${usage?.limit ?? 10} 件已用完` : '本月額度已用完',
      tone: 'danger',
      exhausted: true,
    };
  }
  if (isLifetime) {
    return {
      text: left <= 2 ? `免費額度只剩 ${left} 件` : `免費額度還可產生 ${left} 件`,
      tone: left <= 2 ? 'warn' : 'muted',
      exhausted: false,
    };
  }
  const resetDay = usage?.periodEnd ? new Date(usage.periodEnd).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' }) : '';
  return {
    text: `本月還可產生 ${left} 件${resetDay ? ` · ${resetDay} 重置` : ''}`,
    tone: left <= 5 ? 'warn' : 'muted',
    exhausted: false,
  };
}

/** 網址的主機名稱（空狀態用來告訴使用者「你現在在哪」）。 */
function hostOf(url) {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
}

export function renderHome(state) {
  const { page, settings, jobs, usage } = state;
  const needKey = settings.mode === 'byok' && !settings.geminiApiKey;
  const quota = describeQuota(settings, usage);
  const readyJobs = (jobs || []).filter((j) => j.status === JOB_STATUS.READY);
  const readyCount = readyJobs.length;
  const pendingCount = readyJobs.filter((j) => !j.exportedAt).length;
  const canGenerate = !needKey && !quota.exhausted;
  // 同一件商品已經處理過 → 先給「開啟」，不要默默再扣一件
  const existing = page?.supported ? findJobForUrl(jobs, page.url) : null;
  const existingReady = existing?.status === JOB_STATUS.READY ? existing : null;
  const existingRunning =
    existing && (existing.status === JOB_STATUS.EXTRACTING || existing.status === JOB_STATUS.GENERATING) ? existing : null;

  const quotaLine = (extraClass = '') =>
    quota.text
      ? html`
          <div class="quota-line ${quota.exhausted ? 'is-danger' : quota.tone === 'warn' ? 'is-warn' : ''} ${extraClass}">
            <span>${quota.text}</span>
            ${quota.exhausted
              ? html`<button class="link-btn" data-action="open-options" data-tab="account">或改用自備金鑰</button>`
              : quota.tone === 'warn' && settings.mode !== 'byok'
                ? html`<button class="link-btn" data-action="upgrade">升級方案</button>`
                : ''}
          </div>
        `
      : '';

  return html`
    ${needKey
      ? html`
          <div class="status-line">
            <span>自備金鑰模式尚未填入 Gemini API Key</span>
            <button class="link-btn" data-action="open-options" data-tab="account">前往設定</button>
          </div>
        `
      : ''}

    <section class="panel">
      ${page?.supported
        ? html`
            <div class="source-tag">
              <span>目前分頁 · ${SITE_LABEL[page.site] || page.site}</span>
              ${page.price != null ? html`<span>¥${page.price}</span>` : ''}
            </div>
            <div class="source-title clamp-2">${page.title || page.url}</div>
            ${existingReady
              ? html`
                  <button class="btn btn-primary btn-lg btn-block" data-action="open-job" data-job-id="${existingReady.id}">
                    開啟已產生的圖文
                  </button>
                  <div class="quota-line">
                    <span>這件商品 ${timeAgo(existingReady.updatedAt)}已處理過${existingReady.exportedVia ? `，${EXPORT_VIA_LABEL[existingReady.exportedVia] || '已交付'}` : ''}</span>
                    <button class="link-btn" data-action="start-job" ${canGenerate ? '' : 'disabled'}>
                      重新產生${settings.mode === 'byok' ? '' : '（扣 1 件）'}
                    </button>
                  </div>
                `
              : existingRunning
                ? html`
                    <button class="btn btn-primary btn-lg btn-block" data-action="open-job" data-job-id="${existingRunning.id}">
                      <span class="spinner"></span> 正在產生中 · 開啟
                    </button>
                  `
                : quota.exhausted
                  ? html`
                      <button class="btn btn-primary btn-lg btn-block" data-action="upgrade">升級方案以繼續</button>
                      ${quotaLine()}
                    `
                  : html`
                      <button class="btn btn-primary btn-lg btn-block" data-action="start-job" ${canGenerate ? '' : 'disabled'}>
                        產生蝦皮圖文
                      </button>
                      ${quotaLine()}
                    `}
          `
        : html`
            <div class="source-tag">
              <span>目前分頁${hostOf(page?.url) ? ` · ${hostOf(page.url)}` : ''}</span>
              <span>不是商品頁</span>
            </div>
            <div class="source-empty">
              開啟淘寶、天貓或 1688 的<strong>單一商品頁</strong>後，這裡會出現「產生蝦皮圖文」按鈕。
            </div>
            <div class="site-chips">
              ${[
                ['淘寶', 'https://www.taobao.com/'],
                ['天貓', 'https://www.tmall.com/'],
                ['1688', 'https://www.1688.com/'],
              ].map(
                ([label, url]) => html`
                  <button class="toggle-pill" data-action="open-url" data-url="${url}">${label} ↗</button>
                `,
              )}
            </div>
            ${quotaLine()}
          `}
    </section>

    <div class="sec-label">
      <span>最近處理</span>
      ${readyCount === 1
        ? html`<button class="link-btn" data-action="open-batch-menu">匯出 Excel</button>`
        : ''}
    </div>

    ${jobs?.length
      ? html`
          <div class="history-list">
            ${jobs.map((j) => renderHistoryRow(j, state))}
          </div>
        `
      : html`
          <section class="panel">
            <div class="source-empty">尚無商品紀錄。</div>
          </section>
        `}

    ${readyCount >= 2
      ? html`
          <div class="bottom-bar home-batch-bar">
            <span class="xs muted tabular">
              已完成 ${readyCount} 件${pendingCount && pendingCount < readyCount ? `，${pendingCount} 件尚未匯出` : ''}
            </span>
            <button class="btn btn-secondary" data-action="open-batch-menu">批量匯出 ${icon('chevron')}</button>
          </div>
        `
      : ''}
  `;
}

function renderHistoryRow(j, state) {
  const thumb = j.draft?.coverThumb || j.draft?.coverDataUrl || j.product?.images?.[0]?.hiRes || '';
  const title = j.draft?.title || j.product?.title || '處理中…';
  const price = j.draft?.price?.final;
  const isRunning = j.status === JOB_STATUS.EXTRACTING || j.status === JOB_STATUS.GENERATING;
  const isError = j.status === JOB_STATUS.ERROR;
  const exportedLabel = j.exportedVia ? EXPORT_VIA_LABEL[j.exportedVia] || '已交付' : '';
  const pendingDelete = state.pendingDeleteId === j.id;

  const meta = isRunning
    ? '產生中…'
    : isError
      ? `失敗 · ${j.error?.message || '點開重試'}`
      : `${price ? `${formatTwd(price)} · ` : ''}${timeAgo(j.updatedAt)}`;

  return html`
    <div class="history-row ${isError ? 'is-error' : ''} ${pendingDelete ? 'is-pending-delete' : ''}">
      <button class="history-main" data-action="open-job" data-job-id="${j.id}">
        ${thumb ? html`<img class="history-thumb" src="${thumb}" alt="" />` : html`<div class="history-thumb"></div>`}
        <div class="history-body">
          <div class="history-title truncate">${title}</div>
          <div class="history-meta ${isError ? 'is-error' : ''}">${meta}</div>
        </div>
      </button>
      <div class="history-actions">
        ${exportedLabel && !pendingDelete
          ? html`<span class="history-badge" title="${timeAgo(j.exportedAt)}">${icon('check')}<span>${exportedLabel}</span></span>`
          : ''}
        ${pendingDelete
          ? html`<button class="link-btn is-danger" data-action="delete-job" data-job-id="${j.id}">確定刪除</button>`
          : html`
              <button class="icon-btn history-delete" data-action="delete-job" data-job-id="${j.id}" title="刪除這筆紀錄" aria-label="刪除這筆紀錄">
                ${icon('trash')}
              </button>
            `}
      </div>
    </div>
  `;
}
