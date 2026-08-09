'use strict';

// منطق تجميع التقييم — دالة نقيّة قابلة للاختبار بلا قاعدة بيانات.

/**
 * حساب المتوسّط المتحرّك للتقييم عند إضافة تقييم جديد.
 * @param {number} currentAvg  المتوسّط الحالي
 * @param {number} count       عدد التقييمات الحالية
 * @param {number} newStars    التقييم الجديد (1..5)
 * @returns {{ average: number, count: number }}
 */
function addRating(currentAvg, count, newStars) {
  if (newStars < 1 || newStars > 5) {
    throw new Error('التقييم يجب أن يكون بين 1 و 5');
  }
  const total = currentAvg * count + newStars;
  const nextCount = count + 1;
  const average = +(total / nextCount).toFixed(2); // تقريب لخانتين
  return { average, count: nextCount };
}

module.exports = { addRating };
