'use strict';

// اختبارات وحدة لتصفية الطلبات المجدولة المستحقّة — نقيّة بحقن الوقت.

const test = require('node:test');
const assert = require('node:assert/strict');

const { filterDueOrders } = require('../src/utils/schedule');

const NOW = new Date('2026-01-10T12:00:00Z');

test('filterDueOrders: يعيد المستحقّة غير المُفعّلة فقط', () => {
  const orders = [
    { scheduledAt: '2026-01-10T11:00:00Z', scheduledActivated: false }, // مستحقّ ✔
    { scheduledAt: '2026-01-10T13:00:00Z', scheduledActivated: false }, // لم يحن
    { scheduledAt: '2026-01-10T09:00:00Z', scheduledActivated: true },  // مُفعّل سابقًا
    { scheduledAt: null, scheduledActivated: false },                    // فوري (غير مجدول)
  ];
  const due = filterDueOrders(orders, NOW);
  assert.equal(due.length, 1);
  assert.equal(due[0].scheduledAt, '2026-01-10T11:00:00Z');
});

test('filterDueOrders: قائمة فارغة = لا شيء', () => {
  assert.deepEqual(filterDueOrders([], NOW), []);
});

test('filterDueOrders: يتجاهل الطلبات الفوريّة (بلا جدولة)', () => {
  const orders = [{ scheduledAt: null, scheduledActivated: false }];
  assert.equal(filterDueOrders(orders, NOW).length, 0);
});
