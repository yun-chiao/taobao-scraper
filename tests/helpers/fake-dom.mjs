// 測試用微型 DOM 模擬器（純 JS，無外部依賴）。
// 支援 exact selector lookup 以及基本 innerText / textContent / getAttribute / src。

export function makeDoc({
  title = '',
  elements = {},
  scripts = [],
  meta = {},
} = {}) {
  class FakeElement {
    constructor(def) {
      this.tagName = (def.tag || 'div').toUpperCase();
      this.innerText = def.text || '';
      this.textContent = def.text || '';
      this.attrs = { ...(def.attrs || {}) };
      if (def.src) this.attrs.src = def.src;
      this.children = (def.children || []).map((c) => new FakeElement(c));
    }
    getAttribute(name) {
      return this.attrs[name] ?? null;
    }
    get src() {
      return this.attrs.src || '';
    }
    set src(v) {
      this.attrs.src = v;
    }
  }

  const scriptElements = scripts.map(
    (s) =>
      new FakeElement({
        tag: 'script',
        text: s.text,
        attrs: { type: s.type || 'text/javascript' },
      }),
  );

  const metaElements = Object.entries(meta).map(
    ([prop, content]) =>
      new FakeElement({
        tag: 'meta',
        attrs: { property: prop, content },
      }),
  );

  const doc = {
    title,
    querySelector(selector) {
      const all = doc.querySelectorAll(selector);
      return all.length ? all[0] : null;
    },
    querySelectorAll(selector) {
      if (selector === 'script') return scriptElements;
      if (selector.startsWith('meta[')) {
        const m = selector.match(/property="([^"]+)"/);
        if (m) return metaElements.filter((el) => el.getAttribute('property') === m[1]);
      }
      if (selector === 'img') {
        const imgs = [];
        for (const list of Object.values(elements)) {
          for (const item of list) {
            if ((item.tag || '').toLowerCase() === 'img') imgs.push(new FakeElement(item));
          }
        }
        return imgs;
      }
      const match = elements[selector];
      if (match) return match.map((def) => new FakeElement(def));
      return [];
    },
  };

  return doc;
}
