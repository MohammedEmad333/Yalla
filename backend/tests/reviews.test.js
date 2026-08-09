'use strict';

// اختبارات وحدة لتوزيع التقييمات — نقيّة بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const { ratingDistribution } = require('../src/utils/reviews');

test('ratingDistribution: بلا تقييمات = كل النجوم صفر', () => {
  assert.deepEqual(ratingDistribution([]), { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
});

test('ratingDistribution: يعدّ كل نجمة بشكل صحيح', () => {
  const ratings = [{ stars: 5 }, { stars: 5 }, { stars: 4 }, { stars: 1 }];
  assert.deepEqual(ratingDistribution(ratings), { 1: 1, 2: 0, 3: 0, 4: 1, 5: 2 });
});

test('ratingDistribution: يقرّب القيم الكسرية لأقرب نجمة', () => {
  const ratings = [{ stars: 4.4 }, { stars: 4.6 }];
  assert.deepEqual(ratingDistribution(ratings), { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 });
});

test('ratingDistribution: يتجاهل القيم خارج النطاق', () => {
  const ratings = [{ stars: 0 }, { stars: 6 }, { stars: 3 }];
  assert.deepEqual(ratingDistribution(ratings), { 1: 0, 2: 0, 3: 1, 4: 0, 5: 0 });
});
