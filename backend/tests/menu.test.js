'use strict';

// اختبارات وحدة لأدوات قائمة الطعام والسلّة (Card 110) — بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_QTY,
  DEFAULT_CATEGORY,
  normalizeCartItems,
  buildOrderLines,
  cartTotal,
  summarizeCart,
  groupMenuByCategory,
  meetsMinOrder,
} = require('../src/utils/menu');

test('normalizeCartItems: يتجاهل المدخلات غير الصالحة', () => {
  const out = normalizeCartItems([
    { menuItemId: 'a', qty: 2 },
    { menuItemId: '', qty: 3 },   // بلا معرّف
    { menuItemId: 'b', qty: 0 },  // كمّية غير موجبة
    { menuItemId: 'c', qty: -5 },
    null,
    'نص',
  ]);
  assert.deepEqual(out, [{ menuItemId: 'a', qty: 2, note: '' }]);
});

test('normalizeCartItems: يدمج تكرار الصنف نفسه ويقصّ الكمّية القصوى', () => {
  const out = normalizeCartItems([
    { menuItemId: 'a', qty: 3 },
    { menuItemId: 'a', qty: 2, note: 'بلا بصل' },
    { menuItemId: 'b', qty: MAX_QTY + 10 },
  ]);
  assert.deepEqual(out, [
    { menuItemId: 'a', qty: 5, note: 'بلا بصل' },
    { menuItemId: 'b', qty: MAX_QTY, note: '' },
  ]);
});

test('normalizeCartItems: يقبل الأسماء البديلة للحقول (quantity/menuItem/id)', () => {
  const out = normalizeCartItems([{ menuItem: 'x', quantity: 4 }, { id: 'y', qty: 1 }]);
  assert.deepEqual(out.map((i) => i.menuItemId), ['x', 'y']);
  assert.equal(out[0].qty, 4);
});

test('buildOrderLines: يأخذ السعر من قاعدة البيانات لا من العميل', () => {
  const docs = [{ _id: 'a', name: 'برجر', price: 20 }];
  const { lines, itemsTotal, missing } = buildOrderLines(docs, [
    { menuItemId: 'a', qty: 2, note: '', price: 1 }, // سعر العميل يُتجاهل
  ]);
  assert.equal(missing.length, 0);
  assert.equal(lines[0].price, 20);
  assert.equal(itemsTotal, 40);
});

test('buildOrderLines: يبلّغ عن الأصناف المفقودة أو غير المتاحة', () => {
  const docs = [
    { _id: 'a', name: 'برجر', price: 20 },
    { _id: 'b', name: 'بيتزا', price: 30, available: false },
  ];
  const { lines, missing } = buildOrderLines(docs, [
    { menuItemId: 'a', qty: 1 },
    { menuItemId: 'b', qty: 1 },
    { menuItemId: 'zzz', qty: 1 },
  ]);
  assert.equal(lines.length, 1);
  assert.deepEqual(missing.sort(), ['b', 'zzz']);
});

test('cartTotal: مجموع صحيح مع كسور عشرية', () => {
  assert.equal(cartTotal([{ price: 12.5, qty: 2 }, { price: 3.25, qty: 4 }]), 38);
  assert.equal(cartTotal([]), 0);
  assert.equal(cartTotal(null), 0);
});

test('summarizeCart: ملخّص نصّي للشحنة مع الملاحظة', () => {
  const text = summarizeCart('مطعم يلا', [
    { name: 'برجر', qty: 2 },
    { name: 'بطاطا', qty: 1 },
  ], 'بلا كاتشب');
  assert.equal(text, 'مطعم يلا: 2× برجر، 1× بطاطا — بلا كاتشب');
});

test('summarizeCart: بلا ملاحظة وبلا اسم مطعم', () => {
  assert.equal(summarizeCart('', [{ name: 'شاورما', qty: 3 }]), '3× شاورما');
});

test('groupMenuByCategory: يجمّع الأصناف ويحافظ على ترتيب الأقسام', () => {
  const groups = groupMenuByCategory([
    { name: 'برجر', category: 'ساندويشات' },
    { name: 'كولا', category: 'مشروبات' },
    { name: 'شاورما', category: 'ساندويشات' },
    { name: 'صنف بلا قسم' },
  ]);
  assert.deepEqual(groups.map((g) => g.category), ['ساندويشات', 'مشروبات', DEFAULT_CATEGORY]);
  assert.equal(groups[0].items.length, 2);
});

test('meetsMinOrder: يقارن مجموع السلّة بالحدّ الأدنى', () => {
  assert.equal(meetsMinOrder(30, 25), true);
  assert.equal(meetsMinOrder(25, 25), true);
  assert.equal(meetsMinOrder(10, 25), false);
  assert.equal(meetsMinOrder(0, 0), true);
  assert.equal(meetsMinOrder(5, undefined), true);
});
