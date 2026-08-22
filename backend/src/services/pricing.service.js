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

// حدّ أدنى بسيط للأجرة (يمنع سعرًا صفريًّا داخل الحي نفسه)
const MIN_FARE = 3;

// نُبقي الثابت باسمه القديم للتوافق مع من يقرأه
const TARIFF = { metersPerShekel: METERS_PER_SHEKEL, roadFactor: ROAD_FACTOR, minFare: MIN_FARE };

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
 * @returns {{ distanceKm: number, price: number, currency: string }}
 */
function quote(pickup, dropoff /* , vehicleType */) {
  const distanceKm = estimateDistanceKm(pickup, dropoff);
  const price = calculatePrice(distanceKm);
  return { distanceKm, price, currency: 'ILS' };
}

module.exports = { estimateDistanceKm, calculatePrice, quote, TARIFF, METERS_PER_SHEKEL };
