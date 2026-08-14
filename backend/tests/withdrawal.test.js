'use strict';

// اختبارات وحدة لمنطق سحب أرباح الكابتن (Card 19) — بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeCaptainBalance,
  validateWithdrawal,
  canRequestWithdrawal,
} = require('../src/utils/withdrawal');
const { WITHDRAWAL_STATUS, WITHDRAWAL_METHOD } = require('../src/utils/constants');

test('computeCaptainBalance: المتاح = الأرباح − (المسحوب + المعلّق)', () => {
  const b = computeCaptainBalance(100, [
    { amount: 30, status: WITHDRAWAL_STATUS.DONE },
    { amount: 20, status: WITHDRAWAL_STATUS.PENDING },
    { amount: 15, status: WITHDRAWAL_STATUS.REJECTED }, // لا يؤثّر
  ]);
  assert.equal(b.earned, 100);
  assert.equal(b.done, 30);
  assert.equal(b.pending, 20);
  assert.equal(b.available, 50);
});

test('computeCaptainBalance: لا ينزل المتاح تحت الصفر', () => {
  const b = computeCaptainBalance(10, [{ amount: 30, status: WITHDRAWAL_STATUS.DONE }]);
  assert.equal(b.available, 0);
});

test('validateWithdrawal: يقبل طلبًا صالحًا', () => {
  const err = validateWithdrawal(
    { amount: 20, method: WITHDRAWAL_METHOD.JAWWAL_PAY, phone: '0599123456' },
    50
  );
  assert.equal(err, null);
});

test('validateWithdrawal: يرفض تحت الحدّ الأدنى (١٠ ₪)', () => {
  const err = validateWithdrawal(
    { amount: 5, method: WITHDRAWAL_METHOD.CASH, phone: '0599123456' },
    50
  );
  assert.match(err, /الحدّ الأدنى/);
});

test('validateWithdrawal: يرفض ما يتجاوز الرصيد المتاح', () => {
  const err = validateWithdrawal(
    { amount: 80, method: WITHDRAWAL_METHOD.CASH, phone: '0599123456' },
    50
  );
  assert.match(err, /يتجاوز الرصيد/);
});

test('validateWithdrawal: يرفض طريقة غير مدعومة أو هاتفًا ناقصًا', () => {
  assert.match(
    validateWithdrawal({ amount: 20, method: 'paypal', phone: '0599123456' }, 50),
    /طريقة سحب/
  );
  assert.match(
    validateWithdrawal({ amount: 20, method: WITHDRAWAL_METHOD.CASH, phone: '12' }, 50),
    /رقم الجوال/
  );
});

test('canRequestWithdrawal: صحيح فقط عند بلوغ الحدّ الأدنى', () => {
  assert.equal(canRequestWithdrawal(10), true);
  assert.equal(canRequestWithdrawal(9.99), false);
  assert.equal(canRequestWithdrawal(0), false);
});
