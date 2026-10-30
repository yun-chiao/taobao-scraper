import test from 'node:test';
import assert from 'node:assert/strict';
import { productKeyFromUrl, findJobForUrl, newJob, newUsage, JOB_STATUS } from '../extension/src/shared/contract.js';
import { createStore, memoryBackend } from '../extension/src/shared/storage.js';
import { createPipeline } from '../extension/src/background/pipeline.js';
import { seedBrand, defaultSettings } from '../extension/src/shared/brands.js';
import { initialDraft } from '../extension/src/shared/draft.js';
import { renderHome } from '../extension/src/sidepanel/views/home.js';

const brand = seedBrand();
const settings = defaultSettings();

function product(site, url, itemId) {
  return {
    site,
    url,
    itemId,
    title: `商品 ${itemId}`,
    images: [{ url: 'https://img.alicdn.com/1.jpg', hiRes: 'https://img.alicdn.com/1.jpg' }],
    price: { amount: 58, currency: 'CNY' },
    attrs: {},
    skus: [],
    shopName: null,
    extractor: { adapter: site, strategy: 'dom', warnings: [] },
  };
}

function readyJob(p, extra = {}) {
  const job = newJob({ brandId: brand.id, product: p });
  job.draft = initialDraft(p, brand);
  job.draft.title = `Mimi｜${p.title}`;
  job.draft.price = { ...job.draft.price, final: 390 };
  job.generated = { title: 't' };
  job.status = JOB_STATUS.READY;
  return Object.assign(job, extra);
}

test('productKeyFromUrl ignores tracking params and recognises the three sites', () => {
  assert.equal(productKeyFromUrl('https://item.taobao.com/item.htm?id=7312345678&spm=a21n57.1.0.0'), 'taobao:7312345678');
  assert.equal(productKeyFromUrl('https://item.taobao.com/item.htm?spm=x&id=7312345678#detail'), 'taobao:7312345678');
  assert.equal(productKeyFromUrl('https://detail.tmall.com/item.htm?id=8091122334&skuId=1'), 'tmall:8091122334');
  assert.equal(productKeyFromUrl('https://detail.1688.com/offer/6889900112.html?spm=abc'), '1688:6889900112');
  assert.equal(productKeyFromUrl(''), '');
});

test('findJobForUrl prefers the READY record for the same product', () => {
  const url = 'https://item.taobao.com/item.htm?id=1';
  const failed = readyJob(product('taobao', url, '1'), { status: JOB_STATUS.ERROR });
  const ready = readyJob(product('taobao', `${url}&spm=zzz`, '1'));
  const other = readyJob(product('taobao', 'https://item.taobao.com/item.htm?id=2', '2'));
  assert.equal(findJobForUrl([failed, ready, other], url)?.id, ready.id);
  assert.equal(findJobForUrl([other], url), null);
});

test('home CTA switches to "開啟已產生的圖文" when the current page was already processed', () => {
  const url = 'https://item.taobao.com/item.htm?id=1';
  const existing = readyJob(product('taobao', url, '1'), { exportedVia: 'shopee', exportedAt: Date.now() });
  const page = { supported: true, site: 'taobao', url: `${url}&spm=1`, title: 'x' };
  const out = String(renderHome({ page, settings, jobs: [existing], usage: newUsage({ used: 3 }), brand, brands: [brand] }));
  assert.ok(out.includes('開啟已產生的圖文'));
  assert.ok(out.includes(`data-action="open-job" data-job-id="${existing.id}"`));
  assert.ok(out.includes('重新產生（扣 1 件）'));
  assert.ok(out.includes('已帶入蝦皮'));
  assert.ok(!/btn-primary[^>]*data-action="start-job"/.test(out), 'primary CTA must not silently spend quota');

  const running = readyJob(product('taobao', url, '1'), { status: JOB_STATUS.GENERATING });
  const out2 = String(renderHome({ page, settings, jobs: [running], usage: newUsage(), brand, brands: [brand] }));
  assert.ok(out2.includes('正在產生中'));
});

test('history rows show exported badge, error state, delete affordance and the batch bar', () => {
  const a = readyJob(product('taobao', 'https://item.taobao.com/item.htm?id=1', '1'), {
    exportedVia: 'xlsx',
    exportedAt: Date.now(),
  });
  const b = readyJob(product('tmall', 'https://detail.tmall.com/item.htm?id=2', '2'));
  const c = readyJob(product('1688', 'https://detail.1688.com/offer/3.html', '3'), {
    status: JOB_STATUS.ERROR,
    error: { code: 'MODEL_ERROR', message: 'AI 暫時沒有回應' },
  });
  const page = { supported: false, site: null, url: 'https://www.google.com', title: 'Google' };
  const state = { page, settings, jobs: [a, b, c], usage: newUsage(), brand, brands: [brand], pendingDeleteId: null };
  const out = String(renderHome(state));

  assert.ok(out.includes('已匯出 Excel'));
  assert.ok(out.includes('失敗 · AI 暫時沒有回應'));
  assert.equal((out.match(/data-action="delete-job"/g) || []).length, 3);
  assert.ok(out.includes('home-batch-bar'));
  assert.ok(out.includes('已完成 2 件，1 件尚未匯出'));
  assert.ok(!out.includes('<button class="history-row"'), 'rows must not nest buttons inside buttons');

  const pending = String(renderHome({ ...state, pendingDeleteId: b.id }));
  assert.ok(pending.includes('確定刪除'));
});

test('batch bar is hidden with a single ready job (single export lives in the job view / 匯出 Excel link)', () => {
  const only = readyJob(product('taobao', 'https://item.taobao.com/item.htm?id=1', '1'));
  const page = { supported: false, site: null, url: '', title: '' };
  const out = String(renderHome({ page, settings, jobs: [only], usage: newUsage(), brand, brands: [brand] }));
  assert.ok(!out.includes('home-batch-bar'));
  assert.ok(out.includes('匯出 Excel'));
});

test('store.saveJob keepPosition does not reorder; pipeline.markExported stamps exportedAt/exportedVia', async () => {
  const store = createStore(memoryBackend());
  await store.init();
  await store.saveBrand(brand);
  const older = readyJob(product('taobao', 'https://item.taobao.com/item.htm?id=1', '1'));
  const newer = readyJob(product('taobao', 'https://item.taobao.com/item.htm?id=2', '2'));
  await store.saveJob(older);
  await store.saveJob(newer);
  assert.deepEqual((await store.listJobs()).map((j) => j.id), [newer.id, older.id]);

  // 原地更新（縮圖）不會把舊的搬到最前面
  await store.saveJob({ ...older, draft: { ...older.draft, coverThumb: 'data:image/jpeg;base64,xx' } }, { keepPosition: true });
  assert.deepEqual((await store.listJobs()).map((j) => j.id), [newer.id, older.id]);
  assert.equal((await store.getJob(older.id)).draft.coverThumb, 'data:image/jpeg;base64,xx');

  let emitted = 0;
  const pipeline = createPipeline({
    store,
    extract: async () => null,
    fetchImage: async () => null,
    generate: async () => ({ generated: {}, model: 'fake' }),
    emit: () => {
      emitted += 1;
    },
    track: () => {},
  });

  // silent update：不推播、不改排序
  await pipeline.update(older.id, { coverThumb: 'data:image/jpeg;base64,yy' }, { silent: true });
  assert.equal(emitted, 0);
  assert.deepEqual((await store.listJobs()).map((j) => j.id), [newer.id, older.id]);

  const marked = await pipeline.markExported(older.id, 'shopee');
  assert.equal(marked.exportedVia, 'shopee');
  assert.ok(marked.exportedAt > 0);
  assert.equal(emitted, 1);
  // 交付後這筆會移到最前面（最近有動作的在上面）
  assert.equal((await store.listJobs())[0].id, older.id);
});
