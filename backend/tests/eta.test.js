'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  estimateEtaMinutes,
  etaBreakdown,
  effectiveUrbanSpeed,
  deliveryDueAt,
  isOrderDelayed,
  DELAY_GRACE_MINUTES,
} = require('../src/utils/eta');

test('estimateEtaMinutes: مسافة صفر = وقت الاستلام فقط', () => {
  assert.equal(estimateEtaMinutes(0, 'motorcycle'), 5);
});

test('estimateEtaMinutes: يزيد الزمن بزيادة المسافة', () => {
  const near = estimateEtaMinutes(2, 'motorcycle');
  const far = estimateEtaMinutes(10, 'motorcycle');
  assert.ok(far > near);
});

test('estimateEtaMinutes: الموتوسيكل أسرع من الدرّاجة', () => {
  const moto = estimateEtaMinutes(10, 'motorcycle');
  const bike = estimateEtaMinutes(10, 'bicycle');
  assert.ok(moto < bike);
});

test('Smart ETA: المقاطع القصيرة تستخدم سرعة مدينة أقل من الاسمية', () => {
  assert.ok(effectiveUrbanSpeed(2, 'motorcycle') < effectiveUrbanSpeed(15, 'motorcycle'));
});

test('Smart ETA: 25 كم بالموتوسيكل تشمل معامل الطريق الحضري', () => {
  assert.equal(estimateEtaMinutes(25, 'motorcycle'), 68);
});

test('Smart ETA: ضغط الطلب والتأخير التاريخي يرفعان الزمن', () => {
  const normal = estimateEtaMinutes(5, 'motorcycle');
  const busy = estimateEtaMinutes(5, 'motorcycle', { demandFactor: 1.25, historicalDelayMinutes: 6 });
  assert.ok(busy > normal);
  assert.equal(etaBreakdown(5, 'motorcycle', { historicalDelayMinutes: 6 }).historicalDelayMinutes, 6);
});

test('estimateEtaMinutes: حدّ أدنى دقيقة واحدة', () => {
  assert.ok(estimateEtaMinutes(0, 'motorcycle') >= 1);
});

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
