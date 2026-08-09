'use strict';

const { haversineKm } = require('../utils/geo');

/**
 * خدمة التسعير — تحسب المسافة التقديرية وسعر التوصيل.
 *
 * تصميم قابل للتوسّع: نبدأ بحساب مسافة الخط المستقيم (Haversine) لسرعته
 * وعدم اعتماده على خدمة خارجية، مع نقطة تكامل جاهزة لـ Google Distance Matrix
 * (مسافة الطريق الفعلية) عند الحاجة لدقّة أعلى.
 */

// تعرفة أساسية قابلة للضبط (يمكن نقلها لقاعدة إعدادات لاحقًا)
const TARIFF = {
  baseFare: 15,        // أجرة البدء (ج.م)
  perKm: 5,            // سعر الكيلومتر
  minFare: 20,         // الحدّ الأدنى للأجرة
  // معامل نوع المركبة (الموتوسيكل أسرع/أبعد مدى)
  vehicleFactor: { bicycle: 1.0, motorcycle: 1.15 },
};

// معامل تعويض انحناء الطرق مقابل الخط المستقيم (~1.3 في المدن)
const ROAD_FACTOR = 1.3;

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
 * حساب السعر من المسافة ونوع المركبة.
 * @param {number} distanceKm
 * @param {'bicycle'|'motorcycle'} vehicleType
 */
function calculatePrice(distanceKm, vehicleType = 'motorcycle') {
  const factor = TARIFF.vehicleFactor[vehicleType] ?? 1;
  const raw = (TARIFF.baseFare + distanceKm * TARIFF.perKm) * factor;
  return Math.max(TARIFF.minFare, Math.round(raw));
}

/**
 * تسعيرة كاملة (مسافة + سعر) — تُستخدم في نقطة عرض السعر قبل الطلب.
 * @returns {{ distanceKm: number, price: number, currency: string }}
 */
function quote(pickup, dropoff, vehicleType = 'motorcycle') {
  const distanceKm = estimateDistanceKm(pickup, dropoff);
  const price = calculatePrice(distanceKm, vehicleType);
  return { distanceKm, price, currency: 'EGP' };
}

module.exports = { estimateDistanceKm, calculatePrice, quote, TARIFF };
