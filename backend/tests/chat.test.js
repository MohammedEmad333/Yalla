'use strict';

// اختبارات وحدة لمنطق الدردشة (Card 18) — بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const { canChat, shouldPurgeMessages, validateMessage } = require('../src/utils/chat');
const { ORDER_STATUS } = require('../src/utils/constants');

test('canChat: مسموح خلال فترة التوصيل فقط', () => {
  assert.equal(canChat(ORDER_STATUS.ASSIGNED), true);
  assert.equal(canChat(ORDER_STATUS.ACCEPTED), true);
  assert.equal(canChat(ORDER_STATUS.PICKED_UP), true);
});

test('canChat: ممنوع قبل الإسناد وبعد التسليم/الإلغاء', () => {
  assert.equal(canChat(ORDER_STATUS.PENDING), false);
  assert.equal(canChat(ORDER_STATUS.DELIVERED), false);
  assert.equal(canChat(ORDER_STATUS.CANCELLED), false);
});

test('shouldPurgeMessages: تُحذف الرسائل عند التسليم أو الإلغاء فقط', () => {
  assert.equal(shouldPurgeMessages(ORDER_STATUS.DELIVERED), true);
  assert.equal(shouldPurgeMessages(ORDER_STATUS.CANCELLED), true);
  assert.equal(shouldPurgeMessages(ORDER_STATUS.PICKED_UP), false);
});

test('validateMessage: يقبل نصًّا صالحًا', () => {
  assert.equal(validateMessage('أنا قريب من موقع الاستلام'), null);
});

test('validateMessage: يرفض الفارغ وغير النصّي والطويل جدًّا', () => {
  assert.match(validateMessage('   '), /فارغة/);
  assert.match(validateMessage(123), /مطلوب/);
  assert.match(validateMessage('x'.repeat(1001)), /أطول/);
});
