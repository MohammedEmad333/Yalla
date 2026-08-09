'use strict';

// اختبارات وحدة لقواعد جدولة الطلبات — نقيّة بحقن الوقت.

const test = require('node:test');
const assert = require('node:assert/strict');

const { validateScheduledAt, isDue } = require('../src/utils/schedule');

const NOW = new Date('2026-01-10T12:00:00Z');

test('validateScheduledAt: غياب القيمة = طلب فوري صالح', () => {
  assert.equal(validateScheduledAt(undefined, NOW), null);
  assert.equal(validateScheduledAt('', NOW), null);
});

test('validateScheduledAt: يرفض وقتًا في الماضي', () => {
  assert.ok(validateScheduledAt('2026-01-10T11:00:00Z', NOW));
});

test('validateScheduledAt: يرفض وقتًا غير صالح', () => {
  assert.ok(validateScheduledAt('not-a-date', NOW));
});

test('validateScheduledAt: يقبل وقتًا مستقبليًا ضمن 7 أيام', () => {
  assert.equal(validateScheduledAt('2026-01-11T12:00:00Z', NOW), null);
});

test('validateScheduledAt: يرفض أبعد من 7 أيام', () => {
  assert.ok(validateScheduledAt('2026-01-20T12:00:00Z', NOW));
});

test('isDue: الطلب الفوري مستحقّ دائمًا', () => {
  assert.equal(isDue(null, NOW), true);
});

test('isDue: يقارن وقت الجدولة بالحاضر', () => {
  assert.equal(isDue('2026-01-10T11:59:00Z', NOW), true);  // مضى
  assert.equal(isDue('2026-01-10T12:01:00Z', NOW), false); // لم يحن
});
