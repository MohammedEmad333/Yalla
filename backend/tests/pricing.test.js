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
  const price = pricing.calculatePrice(0.001);
  assert.ok(price >= pricing.TARIFF.minFare);
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

// نموذج التسعير المطلوب (Card 27): "سعر المية وستين متر = ١ شيكل"
test('calculatePrice: كل ١٦٠ مترًا = ١ شيكل', () => {
  // ١٦٠ مترًا = ٠.١٦ كم → ١ ₪ (لكنّ الحدّ الأدنى ٣ ₪ يرفعه)
  assert.equal(pricing.calculatePrice(0.16), pricing.TARIFF.minFare);
  // ١٦٠٠ مترًا = ١.٦ كم → ١٦٠٠ ÷ ١٦٠ = ١٠ ₪
  assert.equal(pricing.calculatePrice(1.6), 10);
  // ٣٢٠٠ مترًا = ٣.٢ كم → ٢٠ ₪
  assert.equal(pricing.calculatePrice(3.2), 20);
});

test('calculatePrice: المسافة الصفرية (داخل الحي نفسه) = الحدّ الأدنى', () => {
  assert.equal(pricing.calculatePrice(0), pricing.TARIFF.minFare);
});

test('METERS_PER_SHEKEL = ١٦٠', () => {
  assert.equal(pricing.METERS_PER_SHEKEL, 160);
});
