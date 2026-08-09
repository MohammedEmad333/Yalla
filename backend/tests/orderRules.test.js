'use strict';

// اختبارات وحدة لقواعد الإلغاء — نقيّة بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const { canUserCancel, canCaptainReject } = require('../src/utils/orderRules');
const { ORDER_STATUS } = require('../src/utils/constants');

test('canUserCancel: يسمح بالإلغاء قبل الاستلام', () => {
  assert.equal(canUserCancel(ORDER_STATUS.PENDING), true);
  assert.equal(canUserCancel(ORDER_STATUS.ASSIGNED), true);
  assert.equal(canUserCancel(ORDER_STATUS.ACCEPTED), true);
});

test('canUserCancel: يمنع الإلغاء بعد الاستلام', () => {
  assert.equal(canUserCancel(ORDER_STATUS.PICKED_UP), false);
  assert.equal(canUserCancel(ORDER_STATUS.DELIVERED), false);
});

test('canUserCancel: طلب ملغى مسبقًا لا يُلغى مجددًا', () => {
  assert.equal(canUserCancel(ORDER_STATUS.CANCELLED), false);
});

test('canCaptainReject: يسمح بالرفض قبل الاستلام (assigned/accepted)', () => {
  assert.equal(canCaptainReject(ORDER_STATUS.ASSIGNED), true);
  assert.equal(canCaptainReject(ORDER_STATUS.ACCEPTED), true);
});

test('canCaptainReject: يمنع الرفض بعد الاستلام', () => {
  assert.equal(canCaptainReject(ORDER_STATUS.PICKED_UP), false);
  assert.equal(canCaptainReject(ORDER_STATUS.PENDING), false); // لم يُسنَد بعد
});
