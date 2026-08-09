'use strict';

// حساب ملخّص أرباح الكابتن — دالة نقيّة قابلة للاختبار بلا قاعدة بيانات.

// بداية اليوم لتاريخ معيّن
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// بداية الأسبوع (آخر 7 أيام من منتصف ليل اليوم قبل 6 أيام)
function startOfWeek(d) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - 6);
  return x;
}

/**
 * تلخيص أرباح الكابتن من طلباته المسلّمة.
 * @param {Array<{price:number, deliveredAt:Date|string}>} deliveredOrders
 * @param {Date} [now] الوقت المرجعي (يُحقن في الاختبارات)
 * @returns {{ total:number, count:number, today:number, week:number }}
 */
function summarizeEarnings(deliveredOrders, now = new Date()) {
  const todayStart = startOfDay(now);
  const weekStart = startOfWeek(now);

  return deliveredOrders.reduce(
    (acc, o) => {
      const price = o.price || 0;
      const when = o.deliveredAt ? new Date(o.deliveredAt) : null;

      acc.total += price;
      acc.count += 1;
      if (when && when >= todayStart) acc.today += price;
      if (when && when >= weekStart) acc.week += price;
      return acc;
    },
    { total: 0, count: 0, today: 0, week: 0 }
  );
}

module.exports = { summarizeEarnings };
