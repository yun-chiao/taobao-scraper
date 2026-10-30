// 定價引擎（RMB 成本 -> 台幣建議售價、尾數進位、毛利分析）。純函式。

/** @typedef {import('./contract.js').PriceDraft} PriceDraft */

/**
 * 尾數進位：
 * - '9': 進位到個位數為 9 的最小整數（例如 283 -> 289, 289 -> 289, 290 -> 299）
 * - '0': 進位到 10 的倍數（例如 283 -> 290）
 * - 'none': 不額外進位
 * @param {number} n
 * @param {'9'|'0'|'none'} rounding
 */
export function applyRounding(n, rounding = '9') {
  const ceil = Math.ceil(n);
  if (rounding === '9') {
    const rem = ceil % 10;
    return rem === 9 ? ceil : ceil + (9 - rem);
  }
  if (rounding === '0') {
    return Math.ceil(ceil / 10) * 10;
  }
  return ceil;
}

/**
 * 計算建議售價與最終售價。
 * 公式：ceil((costCny * rate + shippingTwd) / (1 - feeRate - marginRate))
 * @param {PriceDraft} draft
 * @returns {PriceDraft}
 */
export function computePrice(draft) {
  const next = { ...draft };
  const cost = next.costCny == null || next.costCny === '' ? NaN : Number(next.costCny);
  const rate = Number(next.rate) > 0 ? Number(next.rate) : 4.6;
  const ship = next.shippingTwd != null && next.shippingTwd !== '' && Number.isFinite(Number(next.shippingTwd))
    ? Number(next.shippingTwd)
    : 0;
  const fee = next.feeRate != null && Number.isFinite(Number(next.feeRate)) ? Number(next.feeRate) : 0.1;
  const margin = next.marginRate != null && Number.isFinite(Number(next.marginRate)) ? Number(next.marginRate) : 0.35;

  next.rate = rate;
  next.shippingTwd = ship;
  next.feeRate = fee;
  next.marginRate = margin;

  if (!Number.isFinite(cost) || cost <= 0 || fee + margin >= 0.95) {
    next.suggested = null;
    return next;
  }

  const baseCostTwd = cost * rate + ship;
  const rawSuggested = Math.ceil(baseCostTwd / (1 - fee - margin));
  next.suggested = applyRounding(rawSuggested, next.rounding || '9');

  if (next.final == null || !Number.isFinite(Number(next.final))) {
    next.final = next.suggested;
  } else {
    next.final = Math.round(Number(next.final));
  }

  return next;
}

/**
 * 計算特定售價下的實際毛利率（0–1）。
 * @param {PriceDraft} draft
 * @param {number|null} [finalPrice]
 * @returns {number}
 */
export function marginAt(draft, finalPrice = draft.final) {
  const price = Number(finalPrice);
  const cost = Number(draft.costCny);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(cost) || cost <= 0) return 0;
  const baseTwd = cost * (Number(draft.rate) || 4.6) + (Number(draft.shippingTwd) || 0);
  const feeTwd = price * (Number(draft.feeRate) || 0);
  const profit = price - baseTwd - feeTwd;
  return profit / price;
}

export function formatTwd(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `NT$${Math.round(Number(n)).toLocaleString('en-US')}`;
}

/**
 * 某個售價下的預估單件淨利（扣除商品成本、運費分攤與平台抽成）。
 * @param {PriceDraft} draft
 * @param {number|null} [finalPrice]
 * @returns {{profitTwd:number, marginRate:number}|null} 沒有成本資料時回傳 null
 */
export function profitAt(draft, finalPrice = draft?.final) {
  const price = Number(finalPrice);
  const cost = Number(draft?.costCny);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(cost) || cost <= 0) return null;
  const baseTwd = cost * (Number(draft.rate) || 4.6) + (Number(draft.shippingTwd) || 0);
  const feeTwd = price * (Number(draft.feeRate) || 0);
  const profitTwd = Math.round(price - baseTwd - feeTwd);
  return { profitTwd, marginRate: profitTwd / price };
}

export function parseCny(str) {
  if (str == null) return null;
  const m = String(str).match(/([0-9]+(?:\.[0-9]+)?)/);
  if (!m) return null;
  const v = parseFloat(m[1]);
  return Number.isFinite(v) ? v : null;
}

/**
 * 產生給 UI 顯示的公式拆解。
 * @param {PriceDraft} draft
 */
export function explainPrice(draft) {
  const computed = computePrice(draft);
  const cost = Number(computed.costCny);
  const hasCost = Number.isFinite(cost) && cost > 0;
  const twdGoods = hasCost ? Math.round(cost * computed.rate) : null;
  const actualMargin = marginAt(computed, computed.final);
  const profitTwd =
    hasCost && computed.final
      ? Math.round(
          computed.final - (cost * computed.rate + computed.shippingTwd) - computed.final * computed.feeRate,
        )
      : null;

  const lines = [
    { label: '來源成本（RMB）', value: hasCost ? `¥${cost}` : '未填' },
    { label: '匯率', value: String(computed.rate) },
    { label: '商品台幣成本', value: formatTwd(twdGoods) },
    { label: '國際運費分攤', value: formatTwd(computed.shippingTwd) },
    { label: '平台手續費率', value: `${Math.round(computed.feeRate * 100)}%` },
    { label: '目標毛利率', value: `${Math.round(computed.marginRate * 100)}%` },
    { label: '建議售價', value: formatTwd(computed.suggested) },
    {
      label: '預估單件毛利',
      value: profitTwd != null ? `${formatTwd(profitTwd)}（${Math.round(actualMargin * 100)}%）` : '—',
    },
  ];

  return {
    lines,
    summary:
      computed.suggested != null
        ? `建議 ${formatTwd(computed.suggested)}・預估毛利 ${formatTwd(profitTwd)}`
        : '填入人民幣成本即可自動試算建議售價',
  };
}
