'use strict';

// اختبارات وحدة لبُناة حمولة الإشعارات — نقيّة بلا اتصال بالشبكة أو Firebase.

const test = require('node:test');
const assert = require('node:assert/strict');

const notifications = require('../src/services/notification.service');

const sampleOrder = {
  _id: 'abc123',
  status: 'accepted',
  pickup: { address: 'وسط البلد' },
  cancelReason: 'ألغاه المستخدم',
};

test('orderAssignedPayload: يحمل نوع ومعرّف الطلب', () => {
  const p = notifications.orderAssignedPayload(sampleOrder);
  assert.equal(p.data.type, 'ORDER_ASSIGNED');
  assert.equal(p.data.orderId, 'abc123');
  assert.ok(p.title.length > 0 && p.body.includes('وسط البلد'));
});

test('orderStatusPayload: نصّ عربي مناسب لكل حالة', () => {
  const p = notifications.orderStatusPayload({ _id: 'x', status: 'delivered' });
  assert.equal(p.data.status, 'delivered');
  assert.ok(p.body.includes('تسليم'));
});

test('orderStatusPayload: حالة غير معروفة لا تكسر البناء', () => {
  const p = notifications.orderStatusPayload({ _id: 'x', status: 'weird' });
  assert.equal(p.data.type, 'ORDER_STATUS');
  assert.ok(p.body.includes('weird'));
});

test('orderCancelledPayload: يعرض سبب الإلغاء', () => {
  const p = notifications.orderCancelledPayload(sampleOrder);
  assert.equal(p.data.type, 'ORDER_CANCELLED');
  assert.equal(p.body, 'ألغاه المستخدم');
});

test('sendToTokens: لا يفعل شيئًا بلا رموز (آمن)', async () => {
  const res = await notifications.sendToTokens([], { title: 't', body: 'b' });
  assert.equal(res.sent, 0);
});
