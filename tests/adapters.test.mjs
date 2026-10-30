import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDoc } from './helpers/fake-dom.mjs';
import { probe, runExtract } from '../extension/src/content/index.js';
import { adapter as taobao } from '../extension/src/content/adapters/taobao.js';
import { adapter as tmall } from '../extension/src/content/adapters/tmall.js';
import { adapter as a1688 } from '../extension/src/content/adapters/alibaba1688.js';

test('probe() matches Taobao, Tmall, 1688 and rejects others', () => {
  assert.deepEqual(probe('https://item.taobao.com/item.htm?id=12345'), { supported: true, site: 'taobao' });
  assert.deepEqual(probe('https://detail.tmall.com/item.htm?id=67890'), { supported: true, site: 'tmall' });
  assert.deepEqual(probe('https://detail.1688.com/offer/555666777.html'), { supported: true, site: '1688' });
  assert.deepEqual(probe('https://www.google.com/search?q=earrings'), { supported: false, site: null });
});

test('Taobao adapter extracts via DOM strategy and cleans title & attrs', () => {
  const doc = makeDoc({
    title: 'S925純銀幾何耳釘 - 淘宝网',
    elements: {
      'h1[class*="ItemTitle"]': [{ tag: 'h1', text: 'S925純銀幾何耳釘 - 淘宝网' }],
      'ul[class*="thumbnails"] img': [
        { tag: 'img', src: '//img.alicdn.com/imgextra/i1/123/O1CN01a.jpg_400x400.jpg' },
        { tag: 'img', src: '//img.alicdn.com/imgextra/i1/123/O1CN01b.jpg_400x400.jpg' },
      ],
      '[class*="Price--priceText"]': [{ tag: 'span', text: '¥ 58.00' }],
      'ul[class*="attributes"] li': [
        { tag: 'li', text: '材質：925銀' },
        { tag: 'li', text: '風格: 韓系' },
      ],
    },
  });

  const prod = taobao.extract(doc, { href: 'https://item.taobao.com/item.htm?id=998877' }, {});
  assert.equal(prod.site, 'taobao');
  assert.equal(prod.itemId, '998877');
  assert.equal(prod.title, 'S925純銀幾何耳釘');
  assert.equal(prod.extractor.strategy, 'dom');
  assert.equal(prod.images.length, 2);
  assert.equal(prod.images[0].hiRes, 'https://img.alicdn.com/imgextra/i1/123/O1CN01a.jpg');
  assert.deepEqual(prod.price, { amount: 58, currency: 'CNY' });
  assert.deepEqual(prod.attrs, { 材質: '925銀', 風格: '韓系' });
});

test('Taobao adapter falls back to global img whitelist when thumbnails missing', () => {
  const doc = makeDoc({
    title: '極簡戒指-淘宝网',
    elements: {
      other_imgs: [
        { tag: 'img', src: 'https://img.alicdn.com/tfs/TB1logo.png' }, // blacklisted
        { tag: 'img', src: 'https://img.alicdn.com/imgextra/i2/O1CN01ring.jpg_300x300.jpg' }, // valid product img
      ],
    },
  });

  const prod = taobao.extract(doc, { href: 'https://item.taobao.com/item.htm?id=112233' }, {});
  assert.equal(prod.extractor.strategy, 'fallback');
  assert.equal(prod.images.length, 1);
  assert.equal(prod.images[0].hiRes, 'https://img.alicdn.com/imgextra/i2/O1CN01ring.jpg');
});

test('Tmall and 1688 adapters extract properly', () => {
  const tmallDoc = makeDoc({
    elements: {
      '.tb-detail-hd h1': [{ tag: 'h1', text: '珍珠項鍊 - 天猫Tmall.com' }],
      '#J_UlThumb img': [{ tag: 'img', src: 'https://gw.alicdn.com/bao/uploaded/i1/TB1pearl.jpg_400x400.jpg' }],
    },
  });
  const tmProd = tmall.extract(tmallDoc, { href: 'https://detail.tmall.com/item.htm?id=445566' }, {});
  assert.equal(tmProd.site, 'tmall');
  assert.equal(tmProd.title, '珍珠項鍊');
  assert.equal(tmProd.images[0].hiRes, 'https://gw.alicdn.com/bao/uploaded/i1/TB1pearl.jpg');

  const doc1688 = makeDoc({
    elements: {
      'h1.title-text': [{ tag: 'h1', text: '批發耳環 - 阿里巴巴' }],
      '.detail-gallery-turn-wrapper img': [
        { tag: 'img', src: 'https://cbu01.alicdn.com/img/ibank/O1CN01ear.jpg_300x300.jpg' },
      ],
      '.price-text': [{ tag: 'span', text: '12.5' }],
    },
  });
  const p1688 = a1688.extract(doc1688, { href: 'https://detail.1688.com/offer/777888999.html' }, {});
  assert.equal(p1688.site, '1688');
  assert.equal(p1688.itemId, '777888999');
  assert.equal(p1688.title, '批發耳環');
  assert.equal(p1688.price?.amount, 12.5);
  assert.equal(p1688.images[0].hiRes, 'https://cbu01.alicdn.com/img/ibank/O1CN01ear.jpg');
});

test('runExtract returns UNSUPPORTED_PAGE and EXTRACT_EMPTY errors accurately', () => {
  const unsupported = runExtract(makeDoc(), { href: 'https://www.google.com' }, {});
  assert.equal(unsupported.error?.code, 'UNSUPPORTED_PAGE');

  const emptyDoc = makeDoc({ title: '空商品頁' });
  const empty = runExtract(emptyDoc, { href: 'https://item.taobao.com/item.htm?id=111' }, {});
  assert.equal(empty.error?.code, 'EXTRACT_EMPTY');
});
