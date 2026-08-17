'use strict';

// اختبارات وحدة لأحياء غزة (Card 27) — منطق نقيّ بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  GAZA_NEIGHBORHOODS,
  listNeighborhoods,
  isValidNeighborhood,
  coordsForNeighborhood,
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
