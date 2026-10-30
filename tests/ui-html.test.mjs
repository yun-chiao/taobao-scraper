import test from 'node:test';
import assert from 'node:assert/strict';
import { html, icon } from '../extension/src/sidepanel/components.js';
import { renderHome } from '../extension/src/sidepanel/views/home.js';
import { renderJobView } from '../extension/src/sidepanel/views/job.js';
import { renderOnboarding } from '../extension/src/sidepanel/views/onboarding.js';
import { seedBrand, defaultSettings } from '../extension/src/shared/brands.js';
import { initialDraft } from '../extension/src/shared/draft.js';

test('nested html templates and arrays do not double-escape HTML tags while escaping user strings', () => {
  const userTitle = '<script>alert(1)</script>';
  const nested = html`<div class="child">${icon('spark')}<span>${userTitle}</span></div>`;
  const list = [1, 2].map((n) => html`<li>Item ${n}</li>`);
  const outer = String(html`<section>${nested}<ul>${list}</ul></section>`);

  assert.ok(outer.includes('<div class="child"><svg'));
  assert.ok(outer.includes('<li>Item 1</li><li>Item 2</li>'));
  assert.ok(outer.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!outer.includes('&lt;div'));
  assert.ok(!outer.includes('&lt;li'));
});

test('all 3 views render clean HTML without escaped tags (&lt;section, &lt;button, &lt;span)', () => {
  const brand = seedBrand();
  const settings = defaultSettings();
  const product = {
    site: 'taobao',
    url: 'https://item.taobao.com/item.htm?id=1',
    itemId: '1',
    title: '極簡幾何耳釘',
    images: [{ url: 'https://img.alicdn.com/1.jpg', hiRes: 'https://img.alicdn.com/1.jpg' }],
    price: { amount: 58, currency: 'CNY' },
    attrs: {},
    skus: [],
    shopName: null,
    extractor: { adapter: 'taobao', strategy: 'dom', warnings: [] },
  };
  const job = {
    id: 'job_1',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: 'ready',
    progress: { step: 'compose', label: '組版與檢查' },
    error: null,
    tabId: 1,
    brandId: brand.id,
    product,
    generated: null,
    draft: initialDraft(product, brand),
    compliance: [{ level: 'warn', field: 'general', message: '測試提示', fix: '修正文字' }],
  };
  const state = {
    page: { supported: true, site: 'taobao', url: product.url, title: product.title },
    brand,
    brands: [brand],
    settings,
    usage: { plan: 'free', used: 1, limit: 10, period: 'lifetime', periodEnd: null },
    jobs: [job],
    job,
  };

  for (const [name, fn] of [
    ['home', renderHome],
    ['job', renderJobView],
    ['onboarding', renderOnboarding],
  ]) {
    const out = String(fn(state));
    assert.ok(!out.includes('&lt;section'), `${name} should not contain escaped <section>`);
    assert.ok(!out.includes('&lt;button'), `${name} should not contain escaped <button>`);
    assert.ok(!out.includes('&lt;div'), `${name} should not contain escaped <div>`);
    assert.ok(!out.includes('&lt;span'), `${name} should not contain escaped <span>`);
  }
});
