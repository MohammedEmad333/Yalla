'use strict';

// اختبارات وحدة لمنطق تجميع التقييم — نقيّة بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const { addRating } = require('../src/utils/rating');

test('addRating: أوّل تقييم يصبح هو المتوسّط', () => {
  const r = addRating(5, 0, 4); // (5*0 + 4)/1 = 4
  assert.deepEqual(r, { average: 4, count: 1 });
});

test('addRating: يحسب المتوسّط المتحرّك بدقّة', () => {
  // متوسّط 4 على تقييمين ثم نضيف 5 → (4*2 + 5)/3 = 4.33
  const r = addRating(4, 2, 5);
  assert.equal(r.count, 3);
  assert.equal(r.average, 4.33);
});

test('addRating: يرفض تقييمًا خارج النطاق 1..5', () => {
  assert.throws(() => addRating(4, 2, 6));
  assert.throws(() => addRating(4, 2, 0));
});

test('addRating: تقييمات متطابقة تُبقي المتوسّط ثابتًا', () => {
  const r = addRating(5, 10, 5);
  assert.equal(r.average, 5);
  assert.equal(r.count, 11);
});
