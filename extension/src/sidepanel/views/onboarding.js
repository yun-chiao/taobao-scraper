// 初次啟用引導：三個選擇、一張即時首圖預覽，30 秒完成。不需要註冊，也不需要 API Key。
import { PERSONA_PRESET_LIST, PALETTE_PRESETS } from '../../shared/brands.js';
import { PLAN_LIMITS } from '../../shared/contract.js';
import { html } from '../ui.js';

export function renderOnboarding(state) {
  const { brand } = state;
  const activePreset = brand?.persona?.presetId || 'warm';

  return html`
    <section class="panel stack-lg">
      <div>
        <h2 style="margin-bottom:4px;">設定你的賣場</h2>
        <p class="xs muted">免費提供 ${PLAN_LIMITS.free} 件 AI 圖文產生，不用註冊、不用金鑰。設定後隨時可在右上角齒輪調整。</p>
      </div>

      <div class="ob-preview-row">
        <div class="ob-preview-stage">
          <canvas id="obCoverPreview" width="400" height="400" aria-label="首圖即時預覽"></canvas>
        </div>
        <div class="field" style="flex:1;min-width:0;">
          <label class="field-label" for="obBrandName">賣場名稱</label>
          <input
            id="obBrandName"
            class="input"
            type="text"
            value="${brand.name}"
            placeholder="例如：Mimi 飾物所"
            data-ob-field="name"
          />
          <div class="xs subtle">會出現在首圖徽章與每個標題最前面。</div>
        </div>
      </div>

      <div class="field">
        <span class="field-label">文案語氣</span>
        <div class="choice-grid">
          ${PERSONA_PRESET_LIST.map(
            (p) => html`
              <button
                class="choice-item ${activePreset === p.id ? 'is-active' : ''}"
                data-action="ob-pick-persona"
                data-preset="${p.id}"
              >
                <div class="choice-title">${p.name}</div>
                <div class="choice-desc">${p.tone}</div>
              </button>
            `,
          )}
        </div>
      </div>

      <div class="field">
        <span class="field-label">首圖配色</span>
        <div class="palette-dots">
          ${PALETTE_PRESETS.map(
            (pal) => html`
              <button
                class="palette-dot ${brand.palette?.bg === pal.bg && brand.palette?.accent === pal.accent ? 'is-active' : ''}"
                style="--p-bg:${pal.bg};--p-accent:${pal.accent};"
                data-action="ob-pick-palette"
                data-palette="${pal.id}"
                title="${pal.name}"
                aria-label="${pal.name}"
              ></button>
            `,
          )}
        </div>
      </div>

      <div class="stack" style="--sp-3:8px;">
        <button class="btn btn-primary btn-lg btn-block" data-action="finish-onboarding">
          開始使用 · 免費 ${PLAN_LIMITS.free} 件
        </button>
        <div class="xs subtle" style="text-align:center;">
          之後可在設定改用自己的 Gemini 金鑰，不限件數。
        </div>
      </div>
    </section>
  `;
}
