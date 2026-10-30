import test from 'node:test';
import assert from 'node:assert/strict';
import { createPipeline } from '../extension/src/background/pipeline.js';
import { createStore, memoryBackend } from '../extension/src/shared/storage.js';
import { seedBrand } from '../extension/src/shared/brands.js';
import { initialDraft } from '../extension/src/shared/draft.js';
import { newJob, JOB_STATUS } from '../extension/src/shared/contract.js';

const product = {
  site: 'taobao',
  url: 'https://item.taobao.com/item.htm?id=1',
  itemId: '1',
  title: '极简几何耳钉',
  images: [{ url: 'https://img.alicdn.com/1.jpg', hiRes: 'https://img.alicdn.com/1.jpg' }],
  price: { amount: 58, currency: 'CNY' },
  attrs: {},
  skus: [],
  shopName: null,
  extractor: { adapter: 'taobao', strategy: 'dom', warnings: [] },
};

function generatedV(n) {
  return {
    title: `標題 v${n}`,
    slogan: `slogan v${n}`,
    body: `內文 v${n}`,
    signature: `心得 v${n}`,
    details: [{ label: '尺寸', value: '1cm' }],
    tags: ['耳釘'],
    style: '極簡',
    materialHints: [],
    warnings: [],
  };
}

async function setup() {
  const store = createStore(memoryBackend());
  await store.init();
  const brand = seedBrand();
  await store.saveBrand(brand);
  await store.setSettings({ mode: 'byok', geminiApiKey: 'k', activeBrandId: brand.id, onboarded: true });
  let version = 0;
  const pipeline = createPipeline({
    store,
    extract: async () => product,
    fetchImage: async () => null,
    generate: async () => ({ generated: generatedV(++version), model: 'fake' }),
    emit: () => {},
    track: () => {},
  });
  return { store, brand, pipeline };
}

test('regenerate(field="title") replaces only the title and clears its edited flag; description edits survive', async () => {
  const { store, brand, pipeline } = await setup();
  const job = newJob({ brandId: brand.id, product });
  job.draft = initialDraft(product, brand);
  job.generated = generatedV(0);
  job.draft.title = '我手改的標題';
  job.draft.description = '我手改的內文';
  job.draft.editedFields = { title: true, description: true };
  job.status = JOB_STATUS.READY;
  await store.saveJob(job);

  const out = await pipeline.regenerate(job.id, 'title');
  assert.equal(out.status, JOB_STATUS.READY);
  assert.notEqual(out.draft.title, '我手改的標題');
  assert.ok(out.draft.title.includes('標題 v1'));
  assert.equal(out.draft.description, '我手改的內文', 'description must be untouched');
  assert.deepEqual(out.draft.editedFields, { title: false, description: true });
});

test('regenerate(field="description") keeps the title (and its edited flag) and rewrites the body', async () => {
  const { store, brand, pipeline } = await setup();
  const job = newJob({ brandId: brand.id, product });
  job.draft = initialDraft(product, brand);
  job.generated = generatedV(0);
  job.draft.title = '我手改的標題';
  job.draft.description = '舊內文';
  job.draft.editedFields = { title: true };
  job.status = JOB_STATUS.READY;
  await store.saveJob(job);

  const out = await pipeline.regenerate(job.id, 'description');
  assert.equal(out.draft.title, '我手改的標題');
  assert.ok(out.draft.description.includes('內文 v1'));
  assert.deepEqual(out.draft.editedFields, { title: true, description: false });
});

test('update() merges editedFields patches without dropping other draft fields', async () => {
  const { store, brand, pipeline } = await setup();
  const job = newJob({ brandId: brand.id, product });
  job.draft = initialDraft(product, brand);
  job.status = JOB_STATUS.READY;
  await store.saveJob(job);

  const out = await pipeline.update(job.id, { title: 'T', editedFields: { title: true } });
  assert.equal(out.draft.title, 'T');
  assert.deepEqual(out.draft.editedFields, { title: true });
  assert.equal(out.draft.coverTemplateId, brand.coverTemplateId);
});
