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

// ── Card 103: حمولات إشعارات الأدمن (نسخة أندرويد) ──────────────
test('newOrderAdminPayload: يحمل عنوانَي الاستلام والتسليم ونوع الحدث', () => {
  const p = notifications.newOrderAdminPayload({
    _id: 'o1',
    pickup: { address: 'الرمال' },
    dropoff: { address: 'الشجاعية' },
  });
  assert.equal(p.data.type, 'ADMIN_NEW_ORDER');
  assert.equal(p.data.orderId, 'o1');
  assert.ok(p.body.includes('الرمال') && p.body.includes('الشجاعية'));
});

test('newOrderAdminPayload: عناوين افتراضية عند غياب البيانات', () => {
  const p = notifications.newOrderAdminPayload({ _id: 'o2' });
  assert.equal(p.data.orderId, 'o2');
  assert.ok(p.body.length > 0);
});

test('orderNeedsReassignAdminPayload: نوع إعادة الإسناد', () => {
  const p = notifications.orderNeedsReassignAdminPayload({ _id: 'o3', pickup: { address: 'التفاح' } });
  assert.equal(p.data.type, 'ADMIN_ORDER_REASSIGN');
  assert.ok(p.body.includes('التفاح'));
});

test('withdrawalAdminPayload: يميّز الكابتن عن العميل ويذكر المبلغ', () => {
  const cap = notifications.withdrawalAdminPayload({ who: 'captain', name: 'أحمد', amount: 50 });
  assert.equal(cap.data.type, 'ADMIN_WITHDRAWAL');
  assert.ok(cap.body.includes('كابتن') && cap.body.includes('أحمد') && cap.body.includes('50'));
  const cust = notifications.withdrawalAdminPayload({ who: 'customer', amount: 20 });
  assert.ok(cust.body.includes('عميل') && cust.body.includes('20'));
});

// ── Card 105: حمولات إشعارات أدمن إضافية ────────────────────────
test('topupRequestAdminPayload: يذكر الاسم والمبلغ والطريقة ونوع الحدث', () => {
  const p = notifications.topupRequestAdminPayload({ name: 'سارة', amount: 100, method: 'jawwalpay' });
  assert.equal(p.data.type, 'ADMIN_TOPUP_REQUEST');
  assert.equal(p.data.method, 'jawwalpay');
  assert.ok(p.body.includes('سارة') && p.body.includes('100') && p.body.includes('jawwalpay'));
});

test('topupRequestAdminPayload: يعمل بلا بيانات (آمن)', () => {
  const p = notifications.topupRequestAdminPayload();
  assert.equal(p.data.type, 'ADMIN_TOPUP_REQUEST');
  assert.ok(p.title.length > 0 && p.body.length > 0);
});

test('supportMessageAdminPayload: يقصّ النصّ الطويل ويحمل الاسم والنوع', () => {
  const long = 'ا'.repeat(200);
  const p = notifications.supportMessageAdminPayload({ name: 'خالد', text: long });
  assert.equal(p.data.type, 'ADMIN_SUPPORT_MESSAGE');
  assert.ok(p.body.includes('خالد'));
  assert.ok(p.body.includes('…') && p.body.length < 120);
});

test('supportMessageAdminPayload: نصّ افتراضي عند غياب الرسالة', () => {
  const p = notifications.supportMessageAdminPayload({});
  assert.ok(p.body.length > 0);
});

test('newUserAdminPayload: يدمج الاسم والهاتف ونوع الحدث', () => {
  const p = notifications.newUserAdminPayload({ _id: 'u1', name: 'محمد', lastName: 'علي', phone: '0599' });
  assert.equal(p.data.type, 'ADMIN_NEW_USER');
  assert.equal(p.data.userId, 'u1');
  assert.ok(p.body.includes('محمد علي') && p.body.includes('0599'));
});

test('newCaptainApplicationAdminPayload: يحمل الاسم والهاتف ونوع الحدث', () => {
  const p = notifications.newCaptainApplicationAdminPayload({ _id: 'a1', fullName: 'عمر يوسف', phone: '0569' });
  assert.equal(p.data.type, 'ADMIN_NEW_CAPTAIN');
  assert.equal(p.data.applicationId, 'a1');
  assert.ok(p.body.includes('عمر يوسف') && p.body.includes('0569'));
});
