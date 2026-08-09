'use strict';

// اختبارات وحدة لدوال الإحصائيات النقيّة — بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const { averageDeliveryMinutes } = require('../src/utils/stats');

test('averageDeliveryMinutes: بلا بيانات = 0', () => {
  assert.equal(averageDeliveryMinutes([]), 0);
});

test('averageDeliveryMinutes: يحسب المتوسّط بالدقائق', () => {
  const base = new Date('2026-01-01T10:00:00Z');
  const orders = [
    { createdAt: base, deliveredAt: new Date('2026-01-01T10:20:00Z') }, // 20 دقيقة
    { createdAt: base, deliveredAt: new Date('2026-01-01T10:40:00Z') }, // 40 دقيقة
  ];
  assert.equal(averageDeliveryMinutes(orders), 30);
});

test('averageDeliveryMinutes: يتجاهل الطلبات بلا تاريخ تسليم', () => {
  const base = new Date('2026-01-01T10:00:00Z');
  const orders = [
    { createdAt: base, deliveredAt: new Date('2026-01-01T10:30:00Z') }, // 30
    { createdAt: base, deliveredAt: null }, // يُتجاهل
  ];
  assert.equal(averageDeliveryMinutes(orders), 30);
});

test('averageDeliveryMinutes: يقبل التواريخ كنصوص', () => {
  const orders = [
    { createdAt: '2026-01-01T10:00:00Z', deliveredAt: '2026-01-01T10:15:00Z' },
  ];
  assert.equal(averageDeliveryMinutes(orders), 15);
});
