'use strict';

// قواعد جدولة الطلبات — دوال نقيّة قابلة للاختبار بلا قاعدة بيانات.

const MAX_AHEAD_MS = 7 * 24 * 60 * 60 * 1000; // أقصى جدولة: 7 أيام

/**
 * التحقّق من صلاحية وقت الجدولة.
 * @param {string|Date|null|undefined} value  الوقت المطلوب (اختياري)
 * @param {Date} now  الوقت المرجعي (يُحقن في الاختبارات)
 * @returns {string|null} رسالة خطأ أو null (صالح / أو غير مجدول)
 */
function validateScheduledAt(value, now = new Date()) {
  if (value === undefined || value === null || value === '') return null; // طلب فوري

  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return 'وقت الجدولة غير صالح';
  if (when.getTime() <= now.getTime()) return 'يجب أن يكون وقت الجدولة في المستقبل';
  if (when.getTime() - now.getTime() > MAX_AHEAD_MS) return 'لا يمكن الجدولة لأكثر من 7 أيام';

  return null;
}

/**
 * هل حان وقت الطلب المجدول؟ (الطلبات الفوريّة تُعتبر مستحقّة دائمًا)
 * @param {Date|string|null} scheduledAt
 * @param {Date} now
 * @returns {boolean}
 */
function isDue(scheduledAt, now = new Date()) {
  if (!scheduledAt) return true;
  return new Date(scheduledAt).getTime() <= now.getTime();
}

/**
 * تصفية الطلبات المجدولة المستحقّة (حان وقتها ولم تُفعّل بعد).
 * دالة نقيّة تُوثّق شرط المُشغّل الخلفي وتُختبر بسهولة.
 * @param {Array<{scheduledAt:Date|string|null, scheduledActivated?:boolean}>} orders
 * @param {Date} now
 */
function filterDueOrders(orders, now = new Date()) {
  return orders.filter(
    (o) => o.scheduledAt && !o.scheduledActivated && isDue(o.scheduledAt, now)
  );
}

module.exports = { validateScheduledAt, isDue, filterDueOrders, MAX_AHEAD_MS };
