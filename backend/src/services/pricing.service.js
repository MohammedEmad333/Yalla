'use strict';

const { haversineKm } = require('../utils/geo');

/**
 * خدمة التسعير — تحسب المسافة التقديرية والسعر التقريبي للتوصيل.
 *
 * نموذج التسعير (Card 55): "سعر المئتين وخمسين مترًا = ١ شيكل".
 *   السعر التقريبي = المسافة بالأمتار ÷ ٢٥٠ (مُقرَّبًا)، بحدٍّ أدنى بسيط.
 * المسافة تُقدَّر بين إحداثيّتي حيّ الاستلام وحيّ التسليم (Haversine) مع معامل
 * تعويض انحناء الطرق. السعر النهائي (الحقيقي) يحدّده الكابتن عند التسليم،
 * ويجب ألّا يتجاوز هذا السعر التقريبي (يُطبَّق في طبقة الخدمة).
 *
 * تصميم قابل للتوسّع: نقطة تكامل جاهزة لـ Google Distance Matrix (مسافة الطريق
 * الفعلية) عند الحاجة لدقّة أعلى، دون تغيير معادلة السعر.
 */

// كل هذا القدر من الأمتار يساوي ١ شيكل (Card 55)
const METERS_PER_SHEKEL = 250;

// معامل تعويض انحناء الطرق مقابل الخط المستقيم (~1.3 في المدن)
const ROAD_FACTOR = 1.3;

// الحدّ الأدنى لأجرة أي طلب = ٥ شيكل (Card 69) — يمنع أي طلب أقل من هذا السعر
const MIN_FARE = 5;

// ── Card 89: عرض لفترة محدودة — سقف السعر ٨ شيكل ──────────────────────────────
// خلال فترة العرض، أيّ طلب سعره التقريبي أكبر من ٨ شيكل يُخفَّض إلى ٨ شيكل، ويُعرض
// السعر الأصلي مشطوبًا في التطبيق. العرض صالح حتى نهاية يوم ٢٠٢٦/١٠/١.
const OFFER_PRICE_CAP = 8;
const OFFER_UNTIL = new Date('2026-10-01T23:59:59.999Z');

/** هل عرض السعر المحدود ما زال ساريًا في اللحظة المُعطاة؟ */
function isOfferActive(at = new Date()) {
  return at.getTime() <= OFFER_UNTIL.getTime();
}

/**
 * تطبيق عرض السقف (Card 89) على سعر تقريبي.
 * @param {number} price السعر التقريبي المحسوب
 * @param {Date} at لحظة التقييم (افتراضيًا الآن)
 * @returns {{ price:number, originalPrice:number, offerApplied:boolean }}
 *   price: السعر بعد العرض (السقف)، originalPrice: السعر قبل العرض، offerApplied: هل خُفِّض فعلًا.
 */
function applyOffer(price, at = new Date()) {
  const original = Math.max(0, Math.round(Number(price) || 0));
  if (isOfferActive(at) && original > OFFER_PRICE_CAP) {
    return { price: OFFER_PRICE_CAP, originalPrice: original, offerApplied: true };
  }
  return { price: original, originalPrice: original, offerApplied: false };
}

// نُبقي الثابت باسمه القديم للتوافق مع من يقرأه
const TARIFF = {
  metersPerShekel: METERS_PER_SHEKEL,
  roadFactor: ROAD_FACTOR,
  minFare: MIN_FARE,
  offerCap: OFFER_PRICE_CAP,
  offerUntil: OFFER_UNTIL,
};

/**
 * تقدير المسافة بالكيلومتر بين نقطتَي الاستلام والتسليم.
 * @param {[number,number]} pickup   [lng, lat]
 * @param {[number,number]} dropoff  [lng, lat]
 */
function estimateDistanceKm(pickup, dropoff) {
  const straight = haversineKm(pickup, dropoff);
  return +(straight * ROAD_FACTOR).toFixed(2);
}

/**
 * حساب السعر التقريبي من المسافة: كل ٢٥٠ مترًا = ١ شيكل (Card 55).
 * @param {number} distanceKm  المسافة بالكيلومتر
 * @returns {number} السعر بالشيكل (عدد صحيح، بحدٍّ أدنى MIN_FARE)
 */
function calculatePrice(distanceKm) {
  const meters = Math.max(0, Number(distanceKm) || 0) * 1000;
  const raw = Math.round(meters / METERS_PER_SHEKEL);
  return Math.max(MIN_FARE, raw);
}

/**
 * تسعيرة كاملة (مسافة + سعر تقريبي) — تُستخدم في نقطة عرض السعر قبل الطلب.
 * نُبقي معامل vehicleType في التوقيع للتوافق مع مَن يستدعيها (لا يؤثّر على السعر).
 * Card 89: نطبّق عرض السقف (٨ شيكل) على السعر ونُرفق السعر الأصلي وحالة العرض
 * ليعرض التطبيق السعر الأصلي مشطوبًا فوق سعر العرض.
 * @returns {{ distanceKm:number, price:number, originalPrice:number, offerApplied:boolean, offerCap:number, currency:string }}
 */
function quote(pickup, dropoff /* , vehicleType */) {
  const distanceKm = estimateDistanceKm(pickup, dropoff);
  const raw = calculatePrice(distanceKm);
  const { price, originalPrice, offerApplied } = applyOffer(raw);
  return {
    distanceKm,
    price,
    originalPrice,
    offerApplied,
    offerCap: OFFER_PRICE_CAP,
    currency: 'ILS',
  };
}

module.exports = {
  estimateDistanceKm,
  calculatePrice,
  applyOffer,
  isOfferActive,
  quote,
  TARIFF,
  METERS_PER_SHEKEL,
  OFFER_PRICE_CAP,
};
