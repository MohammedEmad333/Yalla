'use strict';

// دوال جغرافية نقيّة (بدون تبعيات) — قابلة للاختبار بسهولة.

const EARTH_RADIUS_KM = 6371;

const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * حساب المسافة بين نقطتين بصيغة "خط الطول/العرض" باستخدام معادلة Haversine.
 * @param {[number, number]} a  [lng, lat] النقطة الأولى (بترتيب GeoJSON)
 * @param {[number, number]} b  [lng, lat] النقطة الثانية
 * @returns {number} المسافة بالكيلومترات (خط مستقيم)
 */
function haversineKm(a, b) {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_KM * 2 * Math.asin(Math.sqrt(h));
}

module.exports = { haversineKm };
