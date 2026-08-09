'use strict';

// اختبارات وحدة لتقدير زمن التوصيل — نقيّة بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const { estimateEtaMinutes } = require('../src/utils/eta');

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
