'use strict';

// اختبارات وحدة لأدوات التحقّق من المدخلات — نقيّة بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const { V, runSchema } = require('../src/utils/validate');

test('V.required: يرفض القيم الفارغة ويقبل غيرها', () => {
  assert.ok(V.required(''));
  assert.ok(V.required(undefined));
  assert.equal(V.required('x'), null);
});

test('V.phone: يتحقّق من صيغة الهاتف', () => {
  assert.equal(V.phone('0100000000'), null);
  assert.ok(V.phone('abc'));
});

test('V.minLength / inRange / isIn', () => {
  assert.ok(V.minLength(6)('123'));
  assert.equal(V.minLength(6)('123456'), null);
  assert.ok(V.inRange(1, 5)(6));
  assert.equal(V.inRange(1, 5)(4), null);
  assert.ok(V.isIn(['a', 'b'])('c'));
  assert.equal(V.isIn(['a', 'b'])('a'), null);
});

test('V.coordinates: يقبل [lng,lat] صحيحة ويرفض الشاذّة', () => {
  assert.equal(V.coordinates([31.2, 30.0]), null);
  assert.ok(V.coordinates([200, 30])); // خارج النطاق
  assert.ok(V.coordinates([31.2]));    // ناقصة
});

test('V.location: يتطلّب عنوانًا وإحداثيات صالحة', () => {
  assert.equal(
    V.location({ address: 'وسط البلد', location: { coordinates: [31.2, 30.0] } }),
    null
  );
  assert.ok(V.location({ location: { coordinates: [31.2, 30.0] } })); // بلا عنوان
});

test('runSchema: يجمع أخطاء الحقول المطلوبة', () => {
  const schema = {
    name: [V.required, V.string],
    phone: [V.required, V.phone],
    password: [V.required, V.minLength(6)],
  };
  const errors = runSchema(schema, { name: 'أحمد', phone: 'x', password: '123' });
  assert.ok(errors.phone);     // هاتف غير صالح
  assert.ok(errors.password);  // قصيرة
  assert.equal(errors.name, undefined); // صالح
});

test('runSchema: يتخطّى الحقول الاختيارية الغائبة', () => {
  const schema = { vehicleType: [V.isIn(['bicycle', 'motorcycle'])] };
  assert.deepEqual(runSchema(schema, {}), {}); // غائب واختياري → صالح
  assert.ok(runSchema(schema, { vehicleType: 'car' }).vehicleType); // موجود وخاطئ
});
