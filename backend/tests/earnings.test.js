'use strict';

// اختبارات وحدة لملخّص أرباح الكابتن — نقيّة بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const { summarizeEarnings } = require('../src/utils/earnings');

const NOW = new Date('2026-01-10T12:00:00Z'); // مرجع ثابت

test('summarizeEarnings: بلا طلبات = أصفار', () => {
  assert.deepEqual(summarizeEarnings([], NOW), { total: 0, count: 0, today: 0, week: 0 });
});

test('summarizeEarnings: يجمع الإجمالي والعدد', () => {
  const orders = [
    { price: 30, deliveredAt: '2026-01-10T09:00:00Z' },
    { price: 45, deliveredAt: '2026-01-09T09:00:00Z' },
  ];
  const s = summarizeEarnings(orders, NOW);
  assert.equal(s.total, 75);
  assert.equal(s.count, 2);
});

test('summarizeEarnings: يحسب أرباح اليوم فقط ضمن اليوم', () => {
  const orders = [
    { price: 30, deliveredAt: '2026-01-10T08:00:00Z' }, // اليوم
    { price: 50, deliveredAt: '2026-01-05T08:00:00Z' }, // ضمن الأسبوع لا اليوم
  ];
  const s = summarizeEarnings(orders, NOW);
  assert.equal(s.today, 30);
  assert.equal(s.week, 80); // كلاهما ضمن آخر 7 أيام
});

test('summarizeEarnings: يستبعد ما قبل الأسبوع من الأسبوع', () => {
  const orders = [
    { price: 100, deliveredAt: '2026-01-01T08:00:00Z' }, // أقدم من 7 أيام
    { price: 20, deliveredAt: '2026-01-10T08:00:00Z' }, // اليوم
  ];
  const s = summarizeEarnings(orders, NOW);
  assert.equal(s.total, 120);
  assert.equal(s.week, 20);
  assert.equal(s.today, 20);
});
