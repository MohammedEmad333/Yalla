'use strict';

// تقدير زمن التوصيل — دالة نقيّة قابلة للاختبار بلا قاعدة بيانات.

// متوسّط السرعات داخل المدينة (كم/ساعة) حسب نوع المركبة (Card 92)
// هوائية (bicycle) / كهربائية (electric) / نارية (motorcycle)
const SPEEDS = { bicycle: 12, electric: 18, motorcycle: 25 };

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

// مهلة سماح إضافية قبل اعتبار الطلب متأخّرًا (دقائق) — يمنع تنبيهات زائدة (Card 40)
const DELAY_GRACE_MINUTES = 10;

/**
 * لحظة الاستحقاق التقديرية لتسليم الطلب.
 * نبدأ العدّ من لحظة قبول الكابتن (acceptedAt)، وإلّا الإسناد (assignedAt)،
 * وإلّا الإنشاء (createdAt)، ونضيف الزمن التقديري etaMinutes.
 * @returns {number|null} الطابع الزمني (ms) أو null إن تعذّر الحساب
 */
function deliveryDueAt(order) {
  if (!order) return null;
  const start =
    order.timeline?.acceptedAt ||
    order.timeline?.assignedAt ||
    order.createdAt ||
    null;
  const eta = Number(order.etaMinutes) || 0;
  if (!start || eta <= 0) return null;
  return new Date(start).getTime() + eta * 60_000;
}

/**
 * هل تأخّر الطلب عن زمنه التقديري (مع مهلة سماح)؟ — دالة نقيّة (Card 40).
 * @param {object} order
 * @param {Date|number} now
 * @param {number} graceMinutes
 */
function isOrderDelayed(order, now = Date.now(), graceMinutes = DELAY_GRACE_MINUTES) {
  const due = deliveryDueAt(order);
  if (due == null) return false;
  const t = now instanceof Date ? now.getTime() : Number(now);
  return t > due + graceMinutes * 60_000;
}

module.exports = {
  estimateEtaMinutes,
  SPEEDS,
  deliveryDueAt,
  isOrderDelayed,
  DELAY_GRACE_MINUTES,
};
