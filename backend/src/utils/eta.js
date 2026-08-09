'use strict';

// تقدير زمن التوصيل — دالة نقيّة قابلة للاختبار بلا قاعدة بيانات.

// متوسّط السرعات داخل المدينة (كم/ساعة) حسب نوع المركبة
const SPEEDS = { bicycle: 12, motorcycle: 25 };

// وقت تقديري ثابت للاستلام (دقائق)
const PREP_MINUTES = 5;

/**
 * تقدير زمن التوصيل بالدقائق من المسافة ونوع المركبة.
 * @param {number} distanceKm
 * @param {'bicycle'|'motorcycle'} vehicleType
 * @returns {number} الدقائق التقديرية (1 كحدّ أدنى)
 */
function estimateEtaMinutes(distanceKm, vehicleType = 'motorcycle') {
  const speed = SPEEDS[vehicleType] || SPEEDS.motorcycle;
  const d = Number(distanceKm) || 0;
  const travelMinutes = (d / speed) * 60;
  return Math.max(1, Math.round(travelMinutes + PREP_MINUTES));
}

module.exports = { estimateEtaMinutes, SPEEDS };
