import test from 'node:test';
import assert from 'node:assert/strict';
import { computePrice, explainPrice, marginAt, formatTwd, parseCny } from '../extension/src/shared/pricing.js';

test('computePrice calculates suggested price and rounding accurately', () => {
  // cost 58 CNY, rate 4.6, shipping 60 => base = 58 * 4.6 + 60 = 266.8 + 60 = 326.8
  // fee 0.1, margin 0.3 => divisor = 0.6 => 326.8 / 0.6 = 544.666... => ceil 545 => rounding '9' => 549
  const draft = {
    costCny: 58,
    rate: 4.6,
    shippingTwd: 60,
    feeRate: 0.1,
    marginRate: 0.3,
    rounding: '9',
    suggested: null,
    final: null,
  };

  const p9 = computePrice(draft);
  assert.equal(p9.suggested, 549);
  assert.equal(p9.final, 549);

  const p0 = computePrice({ ...draft, rounding: '0' });
  assert.equal(p0.suggested, 550);

  const pNone = computePrice({ ...draft, rounding: 'none' });
  assert.equal(pNone.suggested, 545);

  // User override preserved
  const pCustom = computePrice({ ...draft, final: 590 });
  assert.equal(pCustom.suggested, 549);
  assert.equal(pCustom.final, 590);
});

test('marginAt, formatTwd, parseCny, explainPrice', () => {
  assert.equal(formatTwd(1289), 'NT$1,289');
  assert.equal(parseCny('¥ 58.50'), 58.5);
  assert.equal(parseCny('58-72'), 58);

  const draft = computePrice({
    costCny: 50,
    rate: 4.5,
    shippingTwd: 50,
    feeRate: 0.1,
    marginRate: 0.3,
    rounding: '9',
    suggested: null,
    final: 500,
  });
  // base = 225 + 50 = 275; fee = 50; profit = 500 - 275 - 50 = 175; margin = 175 / 500 = 0.35
  assert.equal(Math.round(marginAt(draft) * 100), 35);
  const exp = explainPrice(draft);
  assert.equal(exp.lines.length, 8);
});
