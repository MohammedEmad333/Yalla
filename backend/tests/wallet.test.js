'use strict';

// اختبارات وحدة لحسابات محفظة الكابتن (COD) — نقيّة بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const { computeSettlement, summarizeWallet } = require('../src/utils/wallet');

test('computeSettlement: يحسب العمولة والصافي', () => {
  assert.deepEqual(computeSettlement(100, 0.2), { commission: 20, net: 80 });
});

test('computeSettlement: يقرّب العمولة لأقرب صحيح', () => {
  const { commission, net } = computeSettlement(45, 0.2); // 9
  assert.equal(commission, 9);
  assert.equal(net, 36);
});

test('computeSettlement: يحدّ النسبة بين 0 و 1', () => {
  assert.equal(computeSettlement(100, 2).commission, 100); // تُقصّ إلى 1
  assert.equal(computeSettlement(100, -1).commission, 0);  // تُقصّ إلى 0
});

test('summarizeWallet: بلا طلبات = أصفار', () => {
  assert.deepEqual(summarizeWallet([], 0), {
    deliveries: 0, gross: 0, commission: 0, net: 0, owed: 0,
  });
});

test('summarizeWallet: يجمع الإجماليّات ويحسب المستحقّ', () => {
  const orders = [
    { price: 100, commission: 20, captainNet: 80 },
    { price: 50, commission: 10, captainNet: 40 },
  ];
  const s = summarizeWallet(orders, 0);
  assert.equal(s.deliveries, 2);
  assert.equal(s.gross, 150);
  assert.equal(s.commission, 30);
  assert.equal(s.net, 120);
  assert.equal(s.owed, 30); // لا شيء سُوّي
});

test('summarizeWallet: يطرح ما سُوّي ولا ينزل تحت الصفر', () => {
  const orders = [{ price: 100, commission: 20, captainNet: 80 }];
  assert.equal(summarizeWallet(orders, 15).owed, 5);   // 20 − 15
  assert.equal(summarizeWallet(orders, 50).owed, 0);   // لا سالب
});
