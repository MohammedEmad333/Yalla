'use strict';

// اختبارات وحدة لأدوات شحن الرصيد النقيّة — بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isSupportedMethod,
  normalizeAmount,
  canTransition,
  applyToBalance,
  MIN_TOPUP,
  MAX_TOPUP,
} = require('../src/utils/topup');
const { TOPUP_STATUS, PAYMENT_METHOD } = require('../src/utils/constants');

test('isSupportedMethod: يقبل الطرق المعروفة ويرفض غيرها', () => {
  assert.equal(isSupportedMethod(PAYMENT_METHOD.JAWWAL_PAY), true);
  assert.equal(isSupportedMethod(PAYMENT_METHOD.BANK_OF_PALESTINE), true);
  assert.equal(isSupportedMethod('paypal'), false);
  assert.equal(isSupportedMethod(undefined), false);
});

test('normalizeAmount: يقرّب ويقبل ضمن الحدود', () => {
  assert.deepEqual(normalizeAmount(50.4), { ok: true, value: 50 });
  assert.deepEqual(normalizeAmount('120'), { ok: true, value: 120 });
});

test('normalizeAmount: يرفض غير الرقمي وخارج الحدود', () => {
  assert.equal(normalizeAmount('abc').ok, false);
  assert.equal(normalizeAmount(MIN_TOPUP - 1).ok, false);
  assert.equal(normalizeAmount(MAX_TOPUP + 1).ok, false);
});

test('canTransition: من pending فقط إلى approved/rejected', () => {
  assert.equal(canTransition(TOPUP_STATUS.PENDING, TOPUP_STATUS.APPROVED), true);
  assert.equal(canTransition(TOPUP_STATUS.PENDING, TOPUP_STATUS.REJECTED), true);
  // لا موافقة/رفض مكرّر
  assert.equal(canTransition(TOPUP_STATUS.APPROVED, TOPUP_STATUS.REJECTED), false);
  assert.equal(canTransition(TOPUP_STATUS.REJECTED, TOPUP_STATUS.APPROVED), false);
  assert.equal(canTransition(TOPUP_STATUS.PENDING, TOPUP_STATUS.PENDING), false);
});

test('applyToBalance: يضيف ويخصم ويمنع السالب', () => {
  assert.deepEqual(applyToBalance(100, 50), { ok: true, balance: 150 });
  assert.deepEqual(applyToBalance(100, -40), { ok: true, balance: 60 });
  assert.equal(applyToBalance(30, -40).ok, false); // رصيد غير كافٍ
});
