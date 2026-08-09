'use strict';

// اختبارات وحدة لقواعد انتهاء مهلة القبول — نقيّة بحقن الوقت.

const test = require('node:test');
const assert = require('node:assert/strict');

const { isAssignmentExpired, filterExpiredAssignments } = require('../src/utils/timeout');

const NOW = new Date('2026-01-10T12:00:00Z');
const TIMEOUT = 60 * 1000; // دقيقة

test('isAssignmentExpired: بلا وقت إسناد = غير منتهٍ', () => {
  assert.equal(isAssignmentExpired(null, NOW, TIMEOUT), false);
});

test('isAssignmentExpired: ضمن المهلة = غير منتهٍ', () => {
  const assignedAt = new Date('2026-01-10T11:59:30Z'); // مرّ 30 ثانية
  assert.equal(isAssignmentExpired(assignedAt, NOW, TIMEOUT), false);
});

test('isAssignmentExpired: تجاوز المهلة = منتهٍ', () => {
  const assignedAt = new Date('2026-01-10T11:58:00Z'); // مرّت دقيقتان
  assert.equal(isAssignmentExpired(assignedAt, NOW, TIMEOUT), true);
});

test('filterExpiredAssignments: يعيد المنتهية فقط', () => {
  const orders = [
    { _id: 'a', timeline: { assignedAt: '2026-01-10T11:58:00Z' } }, // منتهٍ
    { _id: 'b', timeline: { assignedAt: '2026-01-10T11:59:50Z' } }, // ضمن المهلة
    { _id: 'c', timeline: {} },                                      // بلا إسناد
  ];
  const expired = filterExpiredAssignments(orders, NOW, TIMEOUT);
  assert.equal(expired.length, 1);
  assert.equal(expired[0]._id, 'a');
});
