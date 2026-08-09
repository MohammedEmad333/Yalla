'use strict';

// دوال إحصائية نقيّة — قابلة للاختبار بلا قاعدة بيانات.

/**
 * حساب متوسّط زمن التوصيل بالدقائق من أزواج (الإنشاء → التسليم).
 * يتجاهل الأزواج الناقصة (بلا تاريخ تسليم).
 * @param {Array<{createdAt: Date|string, deliveredAt: Date|string}>} orders
 * @returns {number} المتوسّط بالدقائق (مقرّب لخانة واحدة)، أو 0 إن لا بيانات
 */
function averageDeliveryMinutes(orders) {
  const durations = orders
    .filter((o) => o.createdAt && o.deliveredAt)
    .map((o) => (new Date(o.deliveredAt) - new Date(o.createdAt)) / 60000);

  if (durations.length === 0) return 0;
  const sum = durations.reduce((a, b) => a + b, 0);
  return +(sum / durations.length).toFixed(1);
}

module.exports = { averageDeliveryMinutes };
