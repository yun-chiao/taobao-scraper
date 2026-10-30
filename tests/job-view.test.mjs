import test from 'node:test';
import assert from 'node:assert/strict';
import { renderJobView, groupIssues, suggestHint, errorPrimaryAction } from '../extension/src/sidepanel/views/job.js';
import { seedBrand } from '../extension/src/shared/brands.js';
import { initialDraft } from '../extension/src/shared/draft.js';
import { newJob, JOB_STATUS } from '../extension/src/shared/contract.js';

const brand = seedBrand();
const product = {
  site: 'taobao',
  url: 'https://item.taobao.com/item.htm?id=1',
  itemId: '1',
  title: '极简几何耳钉',
  images: [
    { url: 'https://img.alicdn.com/1.jpg', hiRes: 'https://img.alicdn.com/1.jpg' },
    { url: 'https://img.alicdn.com/2.jpg', hiRes: 'https://img.alicdn.com/2.jpg' },
  ],
  price: { amount: 58, currency: 'CNY' },
  attrs: {},
  skus: [],
  shopName: null,
  extractor: { adapter: 'taobao', strategy: 'dom', warnings: [] },
};

function readyJob(overrides = {}) {
  const job = newJob({ brandId: brand.id, product });
  job.draft = initialDraft(product, brand);
  job.draft.title = 'Mimi 飾物所｜極簡耳釘';
  job.draft.description = '內文';
  job.generated = { title: 'x', body: 'y' };
  job.status = JOB_STATUS.READY;
  return Object.assign(job, overrides);
}

test('extracting state renders a skeleton and a disabled progress button instead of an empty page', () => {
  const job = newJob({ brandId: brand.id });
  const out = String(renderJobView({ job, brand, brands: [brand] }));
  assert.ok(out.includes('skeleton-box'));
  assert.ok(/<button class="btn btn-primary btn-main" disabled>[\s\S]*擷取商品資料…/.test(out));
  assert.ok(!out.includes('id="draftTitle"'));
});

test('first generation hides the raw simplified title/empty description behind skeletons but keeps photos interactive', () => {
  const job = newJob({ brandId: brand.id, product });
  job.draft = initialDraft(product, brand); // title = 品牌｜簡體原標題, description = ''
  job.status = JOB_STATUS.GENERATING;
  job.progress = { step: 'generate', label: 'AI 撰寫文案' };
  const out = String(renderJobView({ job, brand, brands: [brand] }));
  assert.ok(!out.includes('极简几何耳钉'), 'raw simplified title must not be shown as an editable value');
  assert.ok(!out.includes('id="draftTitle"'));
  assert.ok(!out.includes('id="draftDescription"'));
  assert.ok(out.includes('data-action="set-cover-image"'), 'photo strip stays usable while waiting');
  assert.ok(out.includes('AI 撰寫文案…'));
  assert.ok(!out.includes('data-action="push-to-shopee"'));
});

test('rewriting (regenerate with existing copy) keeps fields visible but disabled', () => {
  const job = readyJob({ status: JOB_STATUS.GENERATING, progress: { step: 'generate', label: 'AI 撰寫文案' } });
  const out = String(renderJobView({ job, brand, brands: [brand] }));
  assert.ok(/id="draftTitle"[\s\S]*?disabled/.test(out));
  assert.ok(out.includes('重寫中…'));
});

test('ready state exposes per-field regenerate buttons and the suggested-price shortcut', () => {
  const job = readyJob();
  job.draft.price = { ...job.draft.price, suggested: 390, final: 450 };
  const out = String(renderJobView({ job, brand, brands: [brand] }));
  assert.ok(out.includes('data-action="regenerate" data-field="title"'));
  assert.ok(out.includes('data-action="regenerate" data-field="description"'));
  assert.ok(out.includes('data-action="regenerate" data-field="all"'));
  assert.ok(/id="priceSuggestBtn"[^>]*data-action="reset-suggested-price"(?![^>]*hidden)/.test(out));
  assert.ok(out.includes('回到建議價 NT$390'));
  assert.equal(suggestHint({ suggested: 390, final: 390 }), '');
  assert.equal(suggestHint({ suggested: null, final: 450 }), '');
});

test('compliance issues are rendered under the field they belong to', () => {
  const job = readyJob({
    compliance: [
      { level: 'block', field: 'price', message: '設定售價低於成本' },
      { level: 'block', field: 'title', message: '標題超過上限', fix: '短標題' },
      { level: 'warn', field: 'description', message: '描述含「正品」' },
      { level: 'block', field: 'images', message: '至少需勾選 1 張商品圖片' },
      { level: 'warn', field: 'general', message: '尚未填寫蝦皮分類代碼' },
      { level: 'info', field: 'general', message: '將以預購刊登' },
    ],
  });
  const groups = groupIssues(job.compliance);
  assert.equal(groups.price.length, 1);
  assert.equal(groups.general.length, 2);

  const out = String(renderJobView({ job, brand, brands: [brand] }));
  const idx = (s) => out.indexOf(s);
  // 價格問題在價格列（priceIssues）裡，而不是標題欄下
  assert.ok(idx('id="priceIssues"') < idx('設定售價低於成本'));
  assert.ok(idx('id="draftTitle"') < idx('標題超過上限') && idx('標題超過上限') < idx('claims-row'));
  assert.ok(idx('id="draftDescription"') < idx('描述含「正品」'));
  assert.ok(idx('photo-strip') < idx('至少需勾選 1 張商品圖片') && idx('至少需勾選 1 張商品圖片') < idx('id="draftTitle"'));
  assert.ok(out.includes('class="input price-input is-invalid"'));
  assert.ok(!out.includes('將以預購刊登'), 'info-level general notes are not repeated as issues');
  assert.ok(out.includes('尚未填寫蝦皮分類代碼'));
});

test('errorPrimaryAction maps error codes to the right next step', () => {
  assert.equal(errorPrimaryAction('QUOTA_EXCEEDED').action, 'upgrade');
  assert.equal(errorPrimaryAction('NO_API_KEY').action, 'open-options');
  assert.equal(errorPrimaryAction('EXTRACT_EMPTY').action, 'report-page');
  assert.equal(errorPrimaryAction('MODEL_ERROR').action, 'regenerate');
});
