'use strict';

// اختبارات وحدة للمنطق النقيّ (مسافة + تسعير) — لا تحتاج قاعدة بيانات.
// التشغيل:  npm test    (يستخدم عدّة اختبار Node المدمجة، بلا تبعيات)

const test = require('node:test');
const assert = require('node:assert/strict');

const { haversineKm } = require('../src/utils/geo');
const pricing = require('../src/services/pricing.service');

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
  const price = pricing.calculatePrice(0.1, 'motorcycle');
  assert.ok(price >= pricing.TARIFF.minFare);
});

test('calculatePrice: يزيد السعر بزيادة المسافة', () => {
  const near = pricing.calculatePrice(2, 'motorcycle');
  const far = pricing.calculatePrice(10, 'motorcycle');
  assert.ok(far > near);
});

test('calculatePrice: الموتوسيكل أغلى من الدرّاجة لنفس المسافة', () => {
  const bike = pricing.calculatePrice(8, 'bicycle');
  const moto = pricing.calculatePrice(8, 'motorcycle');
  assert.ok(moto >= bike);
});

test('quote: يُرجع مسافة وسعر وعملة صحيحة', () => {
  const q = pricing.quote(TAHRIR, GIZA, 'motorcycle');
  assert.ok(q.distanceKm > 0);
  assert.ok(q.price >= pricing.TARIFF.minFare);
  assert.equal(q.currency, 'ILS');
});

// نموذج التسعير المطلوب (Card 23): "كيلو ونص مسافة سعر عشرة شيكل"
test('calculatePrice: مسافة ١.٥ كم = ١٠ ₪ بالضبط (لكلا نوعَي المركبة)', () => {
  assert.equal(pricing.calculatePrice(1.5, 'motorcycle'), 10);
  assert.equal(pricing.calculatePrice(1.5, 'bicycle'), 10);
});

test('calculatePrice: أقلّ من كيلو ونص لا يزيد عن السعر الأساسي (١٠ ₪)', () => {
  assert.equal(pricing.calculatePrice(0.5, 'motorcycle'), 10);
  assert.equal(pricing.calculatePrice(1.0, 'bicycle'), 10);
});

test('calculatePrice: كل كيلومتر إضافي بعد كيلو ونص يُحسب بالتعرفة', () => {
  // درّاجة: ٢.٥ كم = ١٠ + (١ × ٥) = ١٥ ₪
  assert.equal(pricing.calculatePrice(2.5, 'bicycle'), 15);
  // موتوسيكل: ٢.٥ كم = ١٠ + (١ × ٥ × ١.١٥) = ١٥.٧٥ ≈ ١٦ ₪
  assert.equal(pricing.calculatePrice(2.5, 'motorcycle'), 16);
});
