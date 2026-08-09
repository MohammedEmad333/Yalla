'use strict';

// اختبارات وحدة لمحدّد المعدّل — نقيّة بحقن الوقت.

const test = require('node:test');
const assert = require('node:assert/strict');

const { RateLimiter } = require('../src/middlewares/rateLimit.middleware');

test('RateLimiter: يسمح ضمن الحدّ', () => {
  const rl = new RateLimiter({ windowMs: 1000, max: 3 });
  assert.equal(rl.check('ip', 0).allowed, true);
  assert.equal(rl.check('ip', 100).allowed, true);
  assert.equal(rl.check('ip', 200).allowed, true);
});

test('RateLimiter: يرفض بعد تجاوز الحدّ في نفس النافذة', () => {
  const rl = new RateLimiter({ windowMs: 1000, max: 2 });
  rl.check('ip', 0);
  rl.check('ip', 10);
  const r = rl.check('ip', 20); // الثالث
  assert.equal(r.allowed, false);
  assert.ok(r.retryAfterMs > 0);
});

test('RateLimiter: يعيد التصفير بعد انتهاء النافذة', () => {
  const rl = new RateLimiter({ windowMs: 1000, max: 1 });
  assert.equal(rl.check('ip', 0).allowed, true);
  assert.equal(rl.check('ip', 500).allowed, false); // ضمن النافذة
  assert.equal(rl.check('ip', 1000).allowed, true); // نافذة جديدة
});

test('RateLimiter: يعزل المفاتيح (IPs) عن بعضها', () => {
  const rl = new RateLimiter({ windowMs: 1000, max: 1 });
  assert.equal(rl.check('ip1', 0).allowed, true);
  assert.equal(rl.check('ip2', 0).allowed, true); // مفتاح مختلف
  assert.equal(rl.check('ip1', 10).allowed, false);
});
