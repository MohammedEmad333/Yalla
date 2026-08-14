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
//
// نموذج التسعير (بطلب العميل): "كيلو ونص مسافة سعر عشرة شيكل".
//   • أوّل baseDistanceKm كيلومتر (كيلو ونص) بسعر ثابت = baseFare (١٠ ₪).
//   • كل كيلومتر إضافي بعد ذلك يُحسب بـ perKm (يتأثّر بنوع المركبة).
// هكذا: مسافة ١.٥ كم → ١٠ ₪ بالضبط، بغضّ النظر عن نوع المركبة.
const TARIFF = {
  baseFare: 10,          // السعر الثابت لأوّل مسافة أساسية (₪)
  baseDistanceKm: 1.5,   // المسافة المشمولة بالسعر الثابت (كيلو ونص)
  perKm: 5,              // سعر الكيلومتر الإضافي بعد المسافة الأساسية
  minFare: 10,           // الحدّ الأدنى للأجرة
  // معامل نوع المركبة (الموتوسيكل أسرع/أبعد مدى) — يُطبَّق على المسافة الإضافية فقط
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
 * السعر = أجرة أساسية ثابتة (تشمل أوّل كيلو ونص) + (المسافة الإضافية × سعر الكيلومتر × معامل المركبة).
 * مثال: ١.٥ كم → ١٠ ₪ بالضبط.
 * @param {number} distanceKm
 * @param {'bicycle'|'motorcycle'} vehicleType
 */
function calculatePrice(distanceKm, vehicleType = 'motorcycle') {
  const factor = TARIFF.vehicleFactor[vehicleType] ?? 1;
  const extraKm = Math.max(0, distanceKm - TARIFF.baseDistanceKm); // ما بعد المسافة الأساسية
  const raw = TARIFF.baseFare + extraKm * TARIFF.perKm * factor;
  return Math.max(TARIFF.minFare, Math.round(raw));
}

/**
 * تسعيرة كاملة (مسافة + سعر) — تُستخدم في نقطة عرض السعر قبل الطلب.
 * @returns {{ distanceKm: number, price: number, currency: string }}
 */
function quote(pickup, dropoff, vehicleType = 'motorcycle') {
  const distanceKm = estimateDistanceKm(pickup, dropoff);
  const price = calculatePrice(distanceKm, vehicleType);
  return { distanceKm, price, currency: 'ILS' };
}

module.exports = { estimateDistanceKm, calculatePrice, quote, TARIFF };
