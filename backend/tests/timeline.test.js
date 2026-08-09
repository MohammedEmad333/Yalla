'use strict';

// اختبارات وحدة لبناء الخطّ الزمني للطلب — نقيّة بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildTimeline } = require('../src/utils/timeline');

test('buildTimeline: طلب جديد — فقط الإنشاء مكتمل', () => {
  const steps = buildTimeline({ createdAt: new Date(), status: 'pending', timeline: {} });
  assert.equal(steps.length, 5);
  assert.equal(steps[0].key, 'created');
  assert.equal(steps[0].done, true);
  assert.equal(steps[1].done, false); // assigned لم يحدث بعد
});

test('buildTimeline: يعلّم الخطوات المكتملة حسب الطوابع', () => {
  const now = new Date();
  const steps = buildTimeline({
    createdAt: now,
    status: 'picked_up',
    timeline: { assignedAt: now, acceptedAt: now, pickedUpAt: now },
  });
  const done = steps.filter((s) => s.done).map((s) => s.key);
  assert.deepEqual(done, ['created', 'assigned', 'accepted', 'picked_up']);
  assert.equal(steps.find((s) => s.key === 'delivered').done, false);
});

test('buildTimeline: الإلغاء يضيف خطوة نهائية', () => {
  const now = new Date();
  const steps = buildTimeline({
    createdAt: now,
    status: 'cancelled',
    timeline: { assignedAt: now, cancelledAt: now },
  });
  const last = steps[steps.length - 1];
  assert.equal(last.key, 'cancelled');
  assert.equal(last.done, true);
});

test('buildTimeline: at تكون null للخطوات غير المكتملة', () => {
  const steps = buildTimeline({ createdAt: new Date(), status: 'pending', timeline: {} });
  assert.equal(steps[4].at, null); // delivered
});
