'use strict';

// اختبارات وحدة للمنطق النقيّ (مسافة + تسعير) — لا تحتاج قاعدة بيانات.
// التشغيل:  npm test    (يستخدم عدّة اختبار Node المدمجة، بلا تبعيات)

const test = require('node:test');
const assert = require('node:assert/strict');

const { haversineKm } = require('../src/utils/geo');
const pricing = require('../src/services/pricing.service');
const { coordsForNeighborhood } = require('../src/utils/neighborhoods');

// نقطتان معروفتان: ميدان التحرير ← الأهرامات (~13 كم خط مستقيم)
const TAHRIR = [31.2357, 30.0444]; // [lng, lat]
const GIZA = [31.1342, 29.9792];

test('haversineKm: مسافة نقطة لنفسها = صفر', () => {
  assert.equal(haversineKm(TAHRIR, TAHRIR), 0);
});

test('haversineKm: التحرير ← الجيزة ضمن النطاق المتوقّع (~11-13كم)', () => {
  const d = haversineKm(TAHRIR, GIZA);
  assert.ok(d > 10 && d < 14, `المسافة خارج المتوقّع: ${d}`);
});

test('calculatePrice: يحترم الحدّ الأدنى للأجرة لمسافة صغيرة', () => {
  const price = pricing.calculatePrice(0.001);
  assert.ok(price >= pricing.TARIFF.minFare);
});

test('الحدّ الأدنى لأجرة التوصيل = ٨ ₪', () => {
  assert.equal(pricing.TARIFF.minFare, 8);
  assert.equal(pricing.calculatePrice(0), 8);
});

test('calculatePrice: يزيد السعر بزيادة المسافة', () => {
  const near = pricing.calculatePrice(2);
  const far = pricing.calculatePrice(10);
  assert.ok(far > near);
});

test('quote: يُرجع مسافة وسعر وعملة صحيحة', () => {
  const q = pricing.quote(TAHRIR, GIZA);
  assert.ok(q.distanceKm > 0);
  assert.ok(q.price >= pricing.TARIFF.minFare);
  assert.equal(q.currency, 'ILS');
});

// نموذج التسعير المطلوب (Card 55): "سعر المئتين وخمسين مترًا = ١ شيكل"
test('calculatePrice: كل ٢٥٠ مترًا = ١ شيكل', () => {
  // ٢٥٠ مترًا = ٠.٢٥ كم → ١ ₪ (لكنّ الحدّ الأدنى ٨ ₪ يرفعه)
  assert.equal(pricing.calculatePrice(0.25), pricing.TARIFF.minFare);
  // ٢٥٠٠ مترًا = ٢.٥ كم → ٢٥٠٠ ÷ ٢٥٠ = ١٠ ₪
  assert.equal(pricing.calculatePrice(2.5), 10);
  // ٥٠٠٠ مترًا = ٥ كم → ٢٠ ₪
  assert.equal(pricing.calculatePrice(5), 20);
});

test('calculatePrice: المسافة الصفرية (داخل الحي نفسه) = الحدّ الأدنى', () => {
  assert.equal(pricing.calculatePrice(0), pricing.TARIFF.minFare);
});

test('METERS_PER_SHEKEL = ٢٥٠', () => {
  assert.equal(pricing.METERS_PER_SHEKEL, 250);
});

test('quote: يستخدم التعرفة العادية بدون سقف أو حقول عرض ترويجي', () => {
  const q = pricing.quote(TAHRIR, GIZA);
  assert.equal(q.price, pricing.calculatePrice(q.distanceKm));
  assert.ok(q.price > 10);
  assert.equal(Object.hasOwn(q, 'offerApplied'), false);
  assert.equal(Object.hasOwn(q, 'originalPrice'), false);
  assert.equal(Object.hasOwn(q, 'offerCap'), false);
});

test('quote: الرمال الجنوبي إلى تل الهوا يُحسب من مركزي الحيّين', () => {
  const pickup = coordsForNeighborhood('الرمال الجنوبي', 'غزة');
  const dropoff = coordsForNeighborhood('تل الهوا', 'غزة');
  const q = pricing.quote(pickup, dropoff);
  assert.equal(q.distanceKm, 1.57);
  assert.equal(q.price, pricing.TARIFF.minFare);
});
