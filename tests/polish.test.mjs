import test from 'node:test';
import assert from 'node:assert/strict';
import { profitAt, computePrice } from '../extension/src/shared/pricing.js';
import { formatPriceSub, priceSubTone, renderJobView } from '../extension/src/sidepanel/views/job.js';
import { renderHome } from '../extension/src/sidepanel/views/home.js';
import { seedBrand, defaultSettings } from '../extension/src/shared/brands.js';
import { initialDraft } from '../extension/src/shared/draft.js';
import { newJob, newUsage, JOB_STATUS } from '../extension/src/shared/contract.js';

const brand = seedBrand();
const settings = defaultSettings();
const product = {
  site: 'taobao',
  url: 'https://item.taobao.com/item.htm?id=1',
  itemId: '1',
  title: '耳釘',
  images: [{ url: 'https://img.alicdn.com/1.jpg', hiRes: 'https://img.alicdn.com/1.jpg' }],
  price: { amount: 58, currency: 'CNY' },
  attrs: {},
  skus: [],
  shopName: null,
  extractor: { adapter: 'taobao', strategy: 'dom', warnings: [] },
};

test('profitAt: net profit after goods cost, shipping share and platform fee', () => {
  const price = computePrice({ costCny: 58, rate: 4.6, shippingTwd: 25, feeRate: 0.1, marginRate: 0.35, rounding: '9', suggested: null, final: null });
  // 58×4.6 = 266.8 + 25 = 291.8 → suggested ceil(291.8/0.55)=531 → 539
  assert.equal(price.suggested, 539);
  const p = profitAt(price);
  assert.equal(p.profitTwd, Math.round(539 - 291.8 - 53.9));
  assert.ok(p.marginRate > 0.35 && p.marginRate < 0.37);
  assert.equal(profitAt({ costCny: null, final: 300 }), null);
  assert.ok(profitAt({ ...price, final: 250 }).profitTwd < 0);
});

test('price summary line shows profit at a glance and flags thin/negative margins', () => {
  const base = initialDraft(product, brand); // costCny 58 → suggested 539
  const healthy = { ...base, daysToShip: 10 };
  assert.match(formatPriceSub(healthy), /成本 ¥58 · 實賺約 \$\d+（3\d%） · 預購 10 天/);
  assert.equal(priceSubTone(healthy), '');

  const thin = { ...base, price: { ...base.price, final: 330 }, daysToShip: 2 };
  assert.match(formatPriceSub(thin), /現貨 2 天內$/);
  assert.equal(priceSubTone(thin), 'is-warn');

  const losing = { ...base, price: { ...base.price, final: 200 } };
  assert.match(formatPriceSub(losing), /每件虧 \$\d+/);
  assert.equal(priceSubTone(losing), 'is-danger');
});

test('shipping mode is a 現貨／預購 switch; the day count only appears for pre-orders', () => {
  const job = newJob({ brandId: brand.id, product });
  job.draft = initialDraft(product, brand);
  job.generated = { title: 't' };
  job.status = JOB_STATUS.READY;

  job.draft.daysToShip = 10;
  const pre = String(renderJobView({ job, brand, brands: [brand] }));
  assert.ok(/data-mode="preorder"[^>]*>/.test(pre));
  assert.ok(/aria-checked="true"[^>]*data-action="set-ship-mode"[^>]*data-mode="preorder"/.test(pre) || /data-mode="preorder"/.test(pre));
  assert.ok(pre.includes('id="daysToShip"'));
  assert.ok(pre.includes('class="textarea autogrow'));

  job.draft.daysToShip = 2;
  const stock = String(renderJobView({ job, brand, brands: [brand] }));
  assert.ok(!stock.includes('id="daysToShip"'), 'no day input for in-stock items');
  assert.ok(/class="is-active"[^>]*data-action="set-ship-mode"[^>]*data-mode="stock"/.test(stock));
});

test('empty state tells the user where they are and offers the three sites', () => {
  const page = { supported: false, site: null, url: 'https://www.google.com/search?q=x', title: 'Google' };
  const out = String(renderHome({ page, settings, jobs: [], usage: newUsage(), brand, brands: [brand] }));
  assert.ok(out.includes('目前分頁 · google.com'));
  assert.ok(out.includes('不是商品頁'));
  assert.equal((out.match(/data-action="open-url"/g) || []).length, 3);
});
