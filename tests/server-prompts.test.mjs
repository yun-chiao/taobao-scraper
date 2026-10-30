import test from 'node:test';
import assert from 'node:assert/strict';
import { PERSONA_PRESETS, buildSystemPrompt, buildUserParts } from '../server/src/lib/prompts.js';

test('PERSONA_PRESETS defines 4 distinct Taiwanese Mandarin tone guides', () => {
  assert.deepEqual(Object.keys(PERSONA_PRESETS), ['warm', 'minimal', 'playful', 'luxury']);
  for (const p of Object.values(PERSONA_PRESETS)) {
    assert.ok(p.toneGuide.length > 30);
  }
});

test('buildSystemPrompt and buildUserParts enforce material policy and multimodal input', () => {
  const sys = buildSystemPrompt(
    {
      name: 'Mimi 飾物所',
      persona: {
        presetId: 'warm',
        tone: '溫柔感性',
        styleTags: ['韓系', '輕奢'],
        signatureTitle: '🐈 Mimi 碎碎唸',
        signatureHint: '分享穿搭心得',
        emoji: true,
      },
    },
    { field: 'all' },
  );

  assert.ok(sys.includes('Mimi 飾物所'));
  assert.ok(sys.includes('materialHints'));

  const parts = buildUserParts(
    {
      site: 'taobao',
      title: 's925純銀耳釘',
      price: { amount: 58, currency: 'CNY' },
      attrs: { 材質: '925銀' },
    },
    { mimeType: 'image/jpeg', dataBase64: 'AAAA' },
  );

  assert.equal(parts.length, 3);
  assert.deepEqual(parts[1], { inlineData: { mimeType: 'image/jpeg', data: 'AAAA' } });
});
