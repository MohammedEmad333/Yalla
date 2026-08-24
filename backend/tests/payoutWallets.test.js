'use strict';

// اختبارات وحدة لتطبيع محافظ الكابتن الإلكترونية (Card 67) — بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizePayoutWallets, VALID_CATEGORIES } = require('../src/utils/payoutWallets');

test('sanitizePayoutWallets: يقبل إدخالًا صالحًا ويقصّ المسافات', () => {
  const out = sanitizePayoutWallets([
    { category: 'jawwal_pay', number: ' 0599123456 ', ownerName: ' محمد ' },
  ]);
  assert.deepEqual(out, [{ category: 'jawwal_pay', number: '0599123456', ownerName: 'محمد' }]);
});

test('sanitizePayoutWallets: يتجاهل التصنيف غير المعروف', () => {
  const out = sanitizePayoutWallets([{ category: 'paypal', number: '123' }]);
  assert.deepEqual(out, []);
});

test('sanitizePayoutWallets: يتجاهل الإدخال بلا رقم محفظة', () => {
  const out = sanitizePayoutWallets([{ category: 'palpay', number: '   ', ownerName: 'x' }]);
  assert.deepEqual(out, []);
});

test('sanitizePayoutWallets: يُبقي إدخالًا واحدًا لكل تصنيف (الأحدث يفوز)', () => {
  const out = sanitizePayoutWallets([
    { category: 'all', number: '111' },
    { category: 'all', number: '222', ownerName: 'صاحب' },
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].number, '222');
  assert.equal(out[0].ownerName, 'صاحب');
});

test('sanitizePayoutWallets: يرتّب حسب ترتيب التصنيفات الثابت', () => {
  const out = sanitizePayoutWallets([
    { category: 'all', number: '4' },
    { category: 'bank_of_palestine', number: '1' },
    { category: 'jawwal_pay', number: '3' },
    { category: 'palpay', number: '2' },
  ]);
  assert.deepEqual(out.map((w) => w.category), VALID_CATEGORIES);
});

test('sanitizePayoutWallets: مدخل غير مصفوفة يُعيد []', () => {
  assert.deepEqual(sanitizePayoutWallets(null), []);
  assert.deepEqual(sanitizePayoutWallets(undefined), []);
  assert.deepEqual(sanitizePayoutWallets('x'), []);
});
