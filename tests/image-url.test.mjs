import test from 'node:test';
import assert from 'node:assert/strict';
import { toHiRes, isLikelyProductImage, dedupeImages, normalizeImages } from '../extension/src/shared/image-url.js';

test('toHiRes: matches all 12 required test cases', () => {
  const cases = [
    // 1.
    {
      in: '//img.alicdn.com/imgextra/i3/123/O1CN01abc_!!123-0-item_pic.jpg_460x460q90.jpg_.webp',
      out: 'https://img.alicdn.com/imgextra/i3/123/O1CN01abc_!!123-0-item_pic.jpg',
    },
    // 2.
    {
      in: 'https://gw.alicdn.com/bao/uploaded/i1/TB1xyz.jpg_400x400.jpg',
      out: 'https://gw.alicdn.com/bao/uploaded/i1/TB1xyz.jpg',
    },
    // 3.
    {
      in: 'https://img.alicdn.com/imgextra/i2/O1CN01def.png_80x80.jpg_.webp',
      out: 'https://img.alicdn.com/imgextra/i2/O1CN01def.png',
    },
    // 4.
    {
      in: 'https://img.alicdn.com/imgextra/i4/O1CN01ghi.jpg_.webp',
      out: 'https://img.alicdn.com/imgextra/i4/O1CN01ghi.jpg',
    },
    // 5.
    {
      in: 'https://img.alicdn.com/imgextra/i1/O1CN01jkl_50x50.jpg',
      out: 'https://img.alicdn.com/imgextra/i1/O1CN01jkl.jpg',
    },
    // 6.
    {
      in: 'https://cbu01.alicdn.com/img/ibank/O1CN01mno.jpg_300x300.jpg',
      out: 'https://cbu01.alicdn.com/img/ibank/O1CN01mno.jpg',
    },
    // 7.
    {
      in: 'https://cbu01.alicdn.com/img/ibank/2020/123/456.jpg_b.jpg',
      out: 'https://cbu01.alicdn.com/img/ibank/2020/123/456.jpg',
    },
    // 8.
    {
      in: 'https://cbu01.alicdn.com/img/ibank/O1CN01pqr.220x220.jpg',
      out: 'https://cbu01.alicdn.com/img/ibank/O1CN01pqr.jpg',
    },
    // 9.
    {
      in: 'https://img.alicdn.com/imgextra/i1/O1CN01stu.jpg?x-oss-process=image/resize,w_100',
      out: 'https://img.alicdn.com/imgextra/i1/O1CN01stu.jpg',
    },
    // 10.
    {
      in: 'https://img.alicdn.com/imgextra/i1/O1CN01vwx-0-item_pic.jpg_q50.jpg',
      out: 'https://img.alicdn.com/imgextra/i1/O1CN01vwx-0-item_pic.jpg',
    },
    // 11.
    { in: '', out: null },
    { in: null, out: null },
    // 12. Non-CDN
    { in: 'https://example.com/a.jpg', out: 'https://example.com/a.jpg' },
  ];

  for (const [idx, c] of cases.entries()) {
    const actual = toHiRes(c.in);
    assert.equal(actual, c.out, `Case ${idx + 1} failed: in=${c.in}, expected=${c.out}, got=${actual}`);
  }
});

test('isLikelyProductImage: handles whitelist and blacklist correctly', () => {
  assert.equal(isLikelyProductImage('https://img.alicdn.com/imgextra/i1/O1CN01.jpg'), true);
  assert.equal(isLikelyProductImage('https://gw.alicdn.com/bao/uploaded/i2/item.jpg'), true);
  assert.equal(isLikelyProductImage('https://cbu01.alicdn.com/img/ibank/item.jpg'), true);

  // Blacklist
  assert.equal(isLikelyProductImage('https://img.alicdn.com/imgextra/i1/shop_logo.png'), false);
  assert.equal(isLikelyProductImage('https://img.alicdn.com/imgextra/i1/play_button.png'), false);
  assert.equal(isLikelyProductImage('https://img.alicdn.com/tfs/TB1abc.png'), false);
  assert.equal(isLikelyProductImage('https://example.com/imgextra/1.jpg'), false); // not alibaba host
});

test('dedupeImages and normalizeImages', () => {
  const images = [
    { url: 'https://img.alicdn.com/imgextra/i1/a.jpg_50x50.jpg', hiRes: 'https://img.alicdn.com/imgextra/i1/a.jpg' },
    { url: 'https://img.alicdn.com/imgextra/i1/a.jpg_800x800.jpg', hiRes: 'https://img.alicdn.com/imgextra/i1/a.jpg' },
    { url: 'https://img.alicdn.com/imgextra/i2/b.jpg', hiRes: 'https://img.alicdn.com/imgextra/i2/b.jpg' },
  ];
  const deduped = dedupeImages(images);
  assert.equal(deduped.length, 2);
  assert.equal(deduped[0].hiRes, 'https://img.alicdn.com/imgextra/i1/a.jpg');
  assert.equal(deduped[1].hiRes, 'https://img.alicdn.com/imgextra/i2/b.jpg');

  const rawList = [
    'https://img.alicdn.com/imgextra/i1/1.jpg_100x100.jpg',
    'https://img.alicdn.com/imgextra/i1/1.jpg_200x200.jpg',
    'https://img.alicdn.com/imgextra/i1/icon_play.png', // filtered
    'https://img.alicdn.com/imgextra/i1/2.jpg',
    'https://img.alicdn.com/imgextra/i1/3.jpg',
  ];
  const normalized = normalizeImages(rawList, { max: 2, filter: true });
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].hiRes, 'https://img.alicdn.com/imgextra/i1/1.jpg');
  assert.equal(normalized[1].hiRes, 'https://img.alicdn.com/imgextra/i1/2.jpg');
});
