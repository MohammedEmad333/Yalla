'use strict';

// اختبارات وحدة لأدوات العنوان المُفصّل (Card 21) — بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const { composeAddress, normalizeLocation } = require('../src/utils/address');

test('composeAddress: يصل الحي والشارع والتفاصيل بفاصلة عربية', () => {
  const s = composeAddress({ neighborhood: 'الرمال', street: 'شارع الجلاء', details: 'عمارة ٥' });
  assert.equal(s, 'الرمال، شارع الجلاء، عمارة ٥');
});

test('composeAddress: يتجاهل الأجزاء الفارغة', () => {
  assert.equal(composeAddress({ neighborhood: 'الرمال', street: '', details: 'برج A' }), 'الرمال، برج A');
  assert.equal(composeAddress({}), '');
});

test('normalizeLocation: يركّب address من الأجزاء عند غيابه', () => {
  const loc = normalizeLocation({
    neighborhood: 'النصر',
    street: 'شارع الثلاثيني',
    details: 'بجانب الصيدلية',
    note: 'اتصل عند الوصول',
    location: { coordinates: [34.46, 31.5] },
  });
  assert.equal(loc.address, 'النصر، شارع الثلاثيني، بجانب الصيدلية');
  assert.equal(loc.note, 'اتصل عند الوصول');
  assert.deepEqual(loc.location.coordinates, [34.46, 31.5]);
});

test('normalizeLocation: يحترم address المُرسَل صراحةً', () => {
  const loc = normalizeLocation({ address: 'عنوان جاهز', neighborhood: 'الرمال' });
  assert.equal(loc.address, 'عنوان جاهز');
});

test('normalizeLocation: يشذّب المسافات ويضمن حقولًا نصّية دائمًا', () => {
  const loc = normalizeLocation({ neighborhood: '  الشجاعية  ' });
  assert.equal(loc.neighborhood, 'الشجاعية');
  assert.equal(loc.street, '');
  assert.equal(loc.details, '');
  assert.equal(loc.note, '');
});
