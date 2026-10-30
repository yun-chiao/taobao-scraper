import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHOPEE_TW_MASS_UPLOAD,
  SIMPLE_SHEET,
  buildWorkbookRows,
  buildClipboardText,
} from '../extension/src/shared/shopee-template.js';

test('buildWorkbookRows emits 5 header rows + N data rows for mass upload template', () => {
  const sampleJob = {
    brandId: 'brand_mimi',
    product: {
      site: 'taobao',
      itemId: '731234',
      url: 'https://item.taobao.com/item.htm?id=731234',
      images: [
        { url: 'https://img.alicdn.com/1.jpg', hiRes: 'https://img.alicdn.com/1.jpg' },
        { url: 'https://img.alicdn.com/2.jpg', hiRes: 'https://img.alicdn.com/2.jpg' },
      ],
    },
    draft: {
      categoryId: '100636',
      title: 'Mimi 飾物所｜極簡耳釘',
      description: '溫柔有質感',
      price: { final: 399 },
      stock: 15,
      weightKg: 0.05,
      daysToShip: 10,
      selectedImages: [0, 1],
      coverImageIndex: 1,
    },
  };

  const rows = buildWorkbookRows(SHOPEE_TW_MASS_UPLOAD, [sampleJob], {
    brandsById: { brand_mimi: { name: 'Mimi 飾物所' } },
  });

  assert.equal(rows.length, 6); // 5 header rows + 1 data row
  const colCount = SHOPEE_TW_MASS_UPLOAD.columns.length;
  for (const r of rows) {
    assert.equal(r.length, colCount);
  }

  const dataRow = rows[5];
  const preOrderColIdx = SHOPEE_TW_MASS_UPLOAD.columns.findIndex((c) => c.key === 'ps_pre_order');
  assert.equal(dataRow[preOrderColIdx], '是');

  // Cover image (index 1) should be placed first
  const img1ColIdx = SHOPEE_TW_MASS_UPLOAD.columns.findIndex((c) => c.key === 'ps_item_cover_image');
  assert.equal(dataRow[img1ColIdx], 'https://img.alicdn.com/2.jpg');

  const simpleRows = buildWorkbookRows(SIMPLE_SHEET, [sampleJob]);
  assert.equal(simpleRows.length, 2); // 1 header + 1 data
  assert.equal(buildClipboardText(sampleJob), 'Mimi 飾物所｜極簡耳釘\n\n溫柔有質感');
});

test('buildWorkbookRows prefers publicUrl over data: base64 blobs and clamps oversized strings', () => {
  const hugeBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(45000);
  const jobWithDataUrls = {
    brandId: 'brand_mimi',
    product: {
      site: 'taobao',
      itemId: '888',
      url: 'https://item.taobao.com/item.htm?id=888',
      images: [
        { url: hugeBase64, hiRes: hugeBase64, publicUrl: 'https://img.alicdn.com/clean_1.jpg' },
        { url: hugeBase64, hiRes: hugeBase64 },
      ],
    },
    draft: {
      title: '測試商品',
      description: 'X'.repeat(40000),
      price: { final: 299 },
      selectedImages: [0, 1],
      coverImageIndex: 0,
    },
  };

  const rows = buildWorkbookRows(SHOPEE_TW_MASS_UPLOAD, [jobWithDataUrls]);
  const dataRow = rows[5];
  const img1Idx = SHOPEE_TW_MASS_UPLOAD.columns.findIndex((c) => c.key === 'ps_item_cover_image');
  const img2Idx = SHOPEE_TW_MASS_UPLOAD.columns.findIndex((c) => c.key === 'ps_item_image_2');
  const descIdx = SHOPEE_TW_MASS_UPLOAD.columns.findIndex((c) => c.key === 'ps_product_description');

  assert.equal(dataRow[img1Idx], 'https://img.alicdn.com/clean_1.jpg');
  assert.equal(dataRow[img2Idx], '');
  assert.ok(dataRow[descIdx].length <= 32000);
});
