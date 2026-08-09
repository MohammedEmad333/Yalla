'use strict';

// اختبارات وحدة لبناء مرشّح الطلبات والترقيم — نقيّة بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildOrderFilter, parsePagination } = require('../src/utils/orderQuery');

test('buildOrderFilter: فارغ بلا معايير', () => {
  assert.deepEqual(buildOrderFilter({}), {});
});

test('buildOrderFilter: يفلتر بالحالة الصالحة فقط', () => {
  assert.deepEqual(buildOrderFilter({ status: 'delivered' }), { status: 'delivered' });
  assert.deepEqual(buildOrderFilter({ status: 'bogus' }), {}); // حالة غير معروفة تُتجاهل
});

test('buildOrderFilter: يبني نطاق التاريخ ويتجاهل غير الصالح', () => {
  const f = buildOrderFilter({ from: '2026-01-01', to: '2026-01-31' });
  assert.ok(f.createdAt.$gte instanceof Date);
  assert.ok(f.createdAt.$lte instanceof Date);

  const f2 = buildOrderFilter({ from: 'not-a-date' });
  assert.equal(f2.createdAt, undefined);
});

test('buildOrderFilter: بحث نصّي يبني $or على العناوين', () => {
  const f = buildOrderFilter({ q: 'الهرم' });
  assert.ok(Array.isArray(f.$or));
  assert.equal(f.$or.length, 3);
  assert.ok(f.$or[0]['pickup.address'] instanceof RegExp);
});

test('buildOrderFilter: يهرب المحارف الخاصّة في البحث', () => {
  // لا يجب أن يرمي خطأ عند إدخال محارف regex
  assert.doesNotThrow(() => buildOrderFilter({ q: 'a.*(b' }));
});

test('parsePagination: قيم افتراضية آمنة', () => {
  assert.deepEqual(parsePagination({}), { page: 1, limit: 20, skip: 0 });
});

test('parsePagination: يحسب skip ويحدّ القيم', () => {
  assert.deepEqual(parsePagination({ page: 3, limit: 10 }), { page: 3, limit: 10, skip: 20 });
  assert.equal(parsePagination({ limit: 999 }).limit, 100); // الحدّ الأقصى
  assert.equal(parsePagination({ page: -5 }).page, 1); // الحدّ الأدنى
});
