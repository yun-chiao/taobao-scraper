import test from 'node:test';
import assert from 'node:assert/strict';
import { fillShopeeProductForm } from '../extension/src/content/shopee-autofill.js';

function createFakeShopeeDom() {
  const fields = new Map();
  let clickedPreorder = null;

  class FakeEvent {
    constructor(type, opts) {
      this.type = type;
      this.bubbles = Boolean(opts?.bubbles);
    }
  }

  const makeInput = (name, tag = 'INPUT') => {
    const el = {
      tagName: tag,
      value: '',
      events: [],
      focus() {},
      getAttribute: (k) => (k === 'data-shopee-field' ? name : null),
      dispatchEvent(ev) {
        this.events.push(ev.type);
      },
    };
    fields.set(name, el);
    return el;
  };

  makeInput('title');
  makeInput('description', 'TEXTAREA');
  makeInput('price');
  makeInput('stock');
  makeInput('parentSku');
  makeInput('daysToShip');

  const doc = {
    body: null,
    querySelector(sel) {
      const m = sel.match(/\[data-shopee-field="([^"]+)"\]/);
      if (m) return fields.get(m[1]) || null;
      const pre = sel.match(/\[data-shopee-preorder="([^"]+)"\]/);
      if (pre) {
        return {
          click() {
            clickedPreorder = pre[1];
          },
        };
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };

  return { doc, win: { Event: FakeEvent }, fields, getClickedPreorder: () => clickedPreorder };
}

test('fillShopeeProductForm populates Shopee Seller Center inputs and triggers reactive events', () => {
  const { doc, win, fields, getClickedPreorder } = createFakeShopeeDom();
  const res = fillShopeeProductForm(doc, win, {
    title: 'Mimi 飾物所｜極簡霧面拉絲耳針',
    description: '低調耐看的日常耳環\n\n【商品規格】\n・顏色：拉絲金',
    price: 539,
    stock: 20,
    daysToShip: 10,
    parentSku: 'TAOBAO-7312345678',
    images: [],
    silentBanner: true,
  });

  assert.equal(res.title, true);
  assert.equal(res.description, true);
  assert.equal(res.price, true);
  assert.equal(res.stock, true);
  assert.equal(res.sku, true);

  assert.equal(fields.get('title').value, 'Mimi 飾物所｜極簡霧面拉絲耳針');
  assert.equal(fields.get('price').value, '539');
  assert.equal(fields.get('stock').value, '20');
  assert.equal(fields.get('parentSku').value, 'TAOBAO-7312345678');
  assert.equal(fields.get('daysToShip').value, '10');
  assert.equal(getClickedPreorder(), 'yes');
  assert.deepEqual(fields.get('title').events, ['input', 'change', 'blur']);
});
