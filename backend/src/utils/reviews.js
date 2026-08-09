'use strict';

// توزيع التقييمات على النجوم (1..5) — دالة نقيّة قابلة للاختبار بلا قاعدة بيانات.

/**
 * حساب عدد التقييمات لكل عدد نجوم.
 * @param {Array<{stars:number}>} ratings
 * @returns {{1:number,2:number,3:number,4:number,5:number}}
 */
function ratingDistribution(ratings) {
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of ratings) {
    const s = Math.round(r.stars);
    if (s >= 1 && s <= 5) dist[s] += 1;
  }
  return dist;
}

module.exports = { ratingDistribution };
