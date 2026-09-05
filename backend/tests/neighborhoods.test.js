'use strict';

// اختبارات وحدة لأحياء غزة (Card 27) — منطق نقيّ بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  GAZA_NEIGHBORHOODS,
  listNeighborhoods,
  isValidNeighborhood,
  coordsForNeighborhood,
  CITIES,
  listCities,
  isValidCity,
  listNeighborhoodsByCity,
  neighborhoodsByCity,
} = require('../src/utils/neighborhoods');

test('listNeighborhoods: يُرجع قائمة أسماء غير فارغة', () => {
  const names = listNeighborhoods();
  assert.ok(Array.isArray(names));
  assert.ok(names.length >= 15);
  assert.ok(names.includes('الرمال'));
  assert.ok(names.includes('الشجاعية'));
});

test('isValidNeighborhood: يميّز الحي المعروف من المجهول', () => {
  assert.equal(isValidNeighborhood('الزيتون'), true);
  assert.equal(isValidNeighborhood('  الرمال  '), true); // يتجاهل الفراغات
  assert.equal(isValidNeighborhood('حي غير موجود'), false);
  assert.equal(isValidNeighborhood(''), false);
  assert.equal(isValidNeighborhood(null), false);
});

test('coordsForNeighborhood: يُرجع [lng, lat] صالحة داخل نطاق غزة', () => {
  const c = coordsForNeighborhood('الرمال');
  assert.ok(Array.isArray(c) && c.length === 2);
  const [lng, lat] = c;
  assert.ok(lng > 34 && lng < 35, `lng خارج نطاق غزة: ${lng}`);
  assert.ok(lat > 31 && lat < 32, `lat خارج نطاق غزة: ${lat}`);
});

test('coordsForNeighborhood: يُرجع null للحي المجهول', () => {
  assert.equal(coordsForNeighborhood('لا يوجد'), null);
});

test('coordsForNeighborhood: نسخة جديدة كل مرّة (لا تسريب للمرجع الداخلي)', () => {
  const a = coordsForNeighborhood('الزيتون');
  a[0] = 0;
  const b = coordsForNeighborhood('الزيتون');
  assert.notEqual(b[0], 0);
});

test('كل حيّ يملك اسمًا وإحداثيّتين', () => {
  for (const n of GAZA_NEIGHBORHOODS) {
    assert.ok(typeof n.name === 'string' && n.name.length > 0);
    assert.ok(Array.isArray(n.coordinates) && n.coordinates.length === 2);
  }
});

// ── Card 109: المدن وأحياؤها ──────────────────────────────────────

test('listCities: يُرجع المدن الخمس بالترتيب', () => {
  const cities = listCities();
  assert.deepEqual(cities, ['غزة', 'شمال غزة', 'الوسطى', 'خانيونس', 'رفح']);
  assert.deepEqual(CITIES, cities);
});

test('isValidCity: يميّز المدينة المعروفة (مع تشذيب الفراغات)', () => {
  assert.equal(isValidCity('رفح'), true);
  assert.equal(isValidCity('  خانيونس  '), true);
  assert.equal(isValidCity('القدس'), false);
  assert.equal(isValidCity(''), false);
});

test('listNeighborhoodsByCity: أحياء المدينة فقط', () => {
  const rafah = listNeighborhoodsByCity('رفح');
  assert.ok(rafah.includes('تل السلطان'));
  assert.ok(!rafah.includes('الرمال')); // حي غزة لا يظهر تحت رفح
  assert.deepEqual(listNeighborhoodsByCity('مدينة مجهولة'), []);
});

test('neighborhoodsByCity: خريطة مدينة → أحياء لكل المدن', () => {
  const map = neighborhoodsByCity();
  assert.deepEqual(Object.keys(map), listCities());
  assert.ok(map['الوسطى'].includes('دير البلح'));
});

test('coordsForNeighborhood: يحترم المدينة عند وجود تكرار للأسماء', () => {
  // "النصر" في غزة، و"النصر (رفح)" في رفح — التمييز بالمدينة
  const gazaNasr = coordsForNeighborhood('النصر', 'غزة');
  assert.ok(gazaNasr && gazaNasr[1] > 31.5); // ضمن مدينة غزة (شمالًا)
  const khan = coordsForNeighborhood('خانيونس البلد', 'خانيونس');
  assert.ok(khan && khan[1] < 31.4); // جنوب القطاع
  // حيّ لا ينتمي للمدينة المحدّدة ⇒ null
  assert.equal(coordsForNeighborhood('الرمال', 'رفح'), null);
});

test('isValidNeighborhood: يقبل مدينة اختياريّة للتقييد', () => {
  assert.equal(isValidNeighborhood('دير البلح', 'الوسطى'), true);
  assert.equal(isValidNeighborhood('دير البلح', 'غزة'), false);
  assert.equal(isValidNeighborhood('دير البلح'), true); // بلا مدينة يبحث عالميًّا
});
