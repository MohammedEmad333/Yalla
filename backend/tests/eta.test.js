'use strict';

// اختبارات وحدة لتقدير زمن التوصيل — نقيّة بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  estimateEtaMinutes,
  deliveryDueAt,
  isOrderDelayed,
  DELAY_GRACE_MINUTES,
} = require('../src/utils/eta');

test('estimateEtaMinutes: مسافة صفر = وقت الاستلام فقط', () => {
  assert.equal(estimateEtaMinutes(0, 'motorcycle'), 5); // PREP_MINUTES
});

test('estimateEtaMinutes: يزيد الزمن بزيادة المسافة', () => {
  const near = estimateEtaMinutes(2, 'motorcycle');
  const far = estimateEtaMinutes(10, 'motorcycle');
  assert.ok(far > near);
});

test('estimateEtaMinutes: الموتوسيكل أسرع من الدرّاجة (زمن أقلّ)', () => {
  const moto = estimateEtaMinutes(10, 'motorcycle');
  const bike = estimateEtaMinutes(10, 'bicycle');
  assert.ok(moto < bike);
});

test('estimateEtaMinutes: 25 كم بالموتوسيكل ≈ 65 دقيقة (60 سير + 5 استلام)', () => {
  assert.equal(estimateEtaMinutes(25, 'motorcycle'), 65);
});

test('estimateEtaMinutes: حدّ أدنى دقيقة واحدة', () => {
  assert.ok(estimateEtaMinutes(0, 'motorcycle') >= 1);
});

// ── تأخّر الطلب عن زمنه التقديري (Card 40) ───────────────────────

test('deliveryDueAt: يبدأ العدّ من acceptedAt + etaMinutes', () => {
  const start = new Date('2026-01-01T10:00:00.000Z');
  const order = { timeline: { acceptedAt: start }, etaMinutes: 30 };
  assert.equal(deliveryDueAt(order), start.getTime() + 30 * 60_000);
});

test('deliveryDueAt: يعيد null بلا زمن تقديري أو بلا نقطة بداية', () => {
  assert.equal(deliveryDueAt({ etaMinutes: 0, createdAt: new Date() }), null);
  assert.equal(deliveryDueAt({ etaMinutes: 20 }), null);
  assert.equal(deliveryDueAt(null), null);
});

test('deliveryDueAt: يتراجع إلى assignedAt ثم createdAt', () => {
  const t = new Date('2026-01-01T10:00:00.000Z');
  assert.equal(deliveryDueAt({ timeline: { assignedAt: t }, etaMinutes: 10 }), t.getTime() + 10 * 60_000);
  assert.equal(deliveryDueAt({ createdAt: t, etaMinutes: 10 }), t.getTime() + 10 * 60_000);
});

test('isOrderDelayed: صحيح فقط بعد الزمن التقديري + مهلة السماح', () => {
  const start = new Date('2026-01-01T10:00:00.000Z');
  const order = { timeline: { acceptedAt: start }, etaMinutes: 30 };
  const due = deliveryDueAt(order);
  assert.equal(isOrderDelayed(order, due - 1000), false);
  assert.equal(isOrderDelayed(order, due + (DELAY_GRACE_MINUTES - 1) * 60_000), false);
  assert.equal(isOrderDelayed(order, due + (DELAY_GRACE_MINUTES + 1) * 60_000), true);
});

test('isOrderDelayed: طلب بلا زمن تقديري لا يُعتبر متأخّرًا', () => {
  assert.equal(isOrderDelayed({ etaMinutes: 0, createdAt: new Date(0) }, Date.now()), false);
});
