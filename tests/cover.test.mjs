import test from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, TEMPLATE_IDS, getTemplate } from '../extension/src/sidepanel/cover/templates.js';
import { fitText, contrastText, paletteFor } from '../extension/src/sidepanel/cover/renderer.js';

function fakeCtx() {
  return {
    measureText(str) {
      let w = 0;
      for (const ch of str) {
        w += ch.charCodeAt(0) > 255 ? 10 : 6;
      }
      return { width: w };
    },
  };
}

test('TEMPLATES has 4 templates and getTemplate falls back safely', () => {
  assert.equal(TEMPLATES.length, 4);
  assert.deepEqual(TEMPLATE_IDS, ['badge-classic', 'editorial', 'polaroid', 'bold']);
  assert.equal(getTemplate('editorial').id, 'editorial');
  assert.equal(getTemplate('non-existent').id, 'badge-classic');
});

test('fitText wraps CJK characters, preserves Latin words, and adds ellipsis', () => {
  const ctx = fakeCtx();
  // 10 CJK chars = width 100
  const lines = fitText(ctx, '流動幾何極簡拉絲耳釘冷淡風小眾設計高級感', 80, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith('…'));

  const latin = fitText(ctx, 'S925 Sterling Silver Earrings', 90, 2);
  assert.equal(latin[0], 'S925 Sterling');

  assert.deepEqual(fitText(ctx, '', 100, 2), []);
});

test('contrastText and paletteFor sanitize hex values', () => {
  assert.equal(contrastText('#FFFFFF'), '#111111');
  assert.equal(contrastText('#0F1B2D'), '#ffffff');

  const def = paletteFor({ palette: { bg: 'invalid', fg: '#222222', accent: '#123' } });
  assert.equal(def.bg, '#FFF9F3');
  assert.equal(def.fg, '#222222');
  assert.equal(def.accent, '#123');
});
