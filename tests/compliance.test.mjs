import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeClaims, isSimplified, checkCompliance, applyFix } from '../extension/src/shared/compliance.js';
import { seedBrand } from '../extension/src/shared/brands.js';

test('sanitizeClaims strips unauthorized material claims and keeps authorized ones', () => {
  const rawTitle = 'Mimi 飾物所｜【925純銀】流動幾何耳釘';
  const stripped = sanitizeClaims(rawTitle, { silver925: false });
  assert.equal(stripped.text, 'Mimi 飾物所｜流動幾何耳釘');
  assert.deepEqual(stripped.removed, ['925 純銀']);

  const kept = sanitizeClaims(rawTitle, { silver925: true });
  assert.equal(kept.text, rawTitle);
  assert.equal(kept.removed.length, 0);
});

test('isSimplified detects simplified Chinese characters', () => {
  assert.equal(isSimplified('这款耳环非常好看'), true);
  assert.equal(isSimplified('這款耳環非常好看'), false);
});

test('checkCompliance orders issues block -> warn -> info and applyFix works', () => {
  const brand = seedBrand(); // materialClaims.silver925 is false by default
  const job = {
    draft: {
      title: 'Mimi 飾物所｜【925純銀】全網最低 幾何耳釘',
      description: '這款很好看',
      selectedImages: [0],
      daysToShip: 10,
      categoryId: '',
      price: { costCny: 50, rate: 4.6, shippingTwd: 60, final: 399 },
    },
  };

  const issues = checkCompliance(job, brand);
  assert.equal(issues[0].level, 'block');
  assert.ok(issues.some((i) => i.level === 'warn'));
  assert.ok(issues.some((i) => i.level === 'info'));

  const claimIssue = issues.find((i) => i.message.includes('材質聲明'));
  assert.ok(claimIssue);
  const fixedDraft = applyFix(job.draft, claimIssue);
  assert.ok(!fixedDraft.title.includes('925純銀'));
});
