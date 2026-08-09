'use strict';

// اختبارات وحدة لتطبيع مفتاح منع التكرار — نقيّة بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeIdempotencyKey } = require('../src/utils/idempotency');

test('normalizeIdempotencyKey: يقصّ المسافات ويعيد المفتاح', () => {
  assert.equal(normalizeIdempotencyKey('  abc-123  '), 'abc-123');
});

test('normalizeIdempotencyKey: غير النصّ = null', () => {
  assert.equal(normalizeIdempotencyKey(undefined), null);
  assert.equal(normalizeIdempotencyKey(123), null);
  assert.equal(normalizeIdempotencyKey(null), null);
});

test('normalizeIdempotencyKey: الفارغ = null', () => {
  assert.equal(normalizeIdempotencyKey('   '), null);
});

test('normalizeIdempotencyKey: الطويل جدًا (>200) = null', () => {
  assert.equal(normalizeIdempotencyKey('x'.repeat(201)), null);
  assert.equal(normalizeIdempotencyKey('x'.repeat(200)), 'x'.repeat(200));
});
