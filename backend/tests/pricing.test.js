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

// نموذج التسعير المطلوب (Card 55): "سعر المئتين وخمسين مترًا = ١ شيكل"
test('calculatePrice: كل ٢٥٠ مترًا = ١ شيكل', () => {
  // ٢٥٠ مترًا = ٠.٢٥ كم → ١ ₪ (لكنّ الحدّ الأدنى ٣ ₪ يرفعه)
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

// Card 89: عرض السقف ٨ شيكل خلال فترة العرض
test('applyOffer: يخفّض السعر الأعلى من ٨ إلى ٨ خلال العرض ويحفظ الأصلي', () => {
  const during = new Date('2026-09-01T00:00:00Z'); // ضمن فترة العرض
  const r = pricing.applyOffer(20, during);
  assert.equal(r.price, 8);
  assert.equal(r.originalPrice, 20);
  assert.equal(r.offerApplied, true);
});

test('applyOffer: لا يغيّر السعر الأقلّ من أو يساوي ٨', () => {
  const during = new Date('2026-09-01T00:00:00Z');
  const r = pricing.applyOffer(6, during);
  assert.equal(r.price, 6);
  assert.equal(r.offerApplied, false);
});

test('applyOffer: بعد انتهاء العرض لا يُطبَّق السقف', () => {
  const after = new Date('2026-12-01T00:00:00Z'); // بعد ١/١٠
  const r = pricing.applyOffer(20, after);
  assert.equal(r.price, 20);
  assert.equal(r.offerApplied, false);
});

test('quote: يرفق السعر الأصلي وحالة العرض والسقف', () => {
  const q = pricing.quote(TAHRIR, GIZA);
  assert.equal(q.offerCap, pricing.OFFER_PRICE_CAP);
  assert.ok(q.originalPrice >= q.price);
});
