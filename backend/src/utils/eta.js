'use strict';

// تقدير زمن التوصيل — دوال نقيّة قابلة للاختبار بلا قاعدة بيانات.

const SPEEDS = { bicycle: 12, electric: 18, motorcycle: 25 };
const PREP_MINUTES = 5;

/**
 * السرعة الفعلية داخل المدينة ليست ثابتة: المقاطع القصيرة تخسر وقتًا أكبر عند
 * التقاطعات والتوقف والانطلاق، بينما الرحلات الأطول تقترب أكثر من السرعة الاسمية.
 */
function effectiveUrbanSpeed(distanceKm, vehicleType = 'motorcycle') {
  const nominal = SPEEDS[vehicleType] || SPEEDS.motorcycle;
  const d = Math.max(0, Number(distanceKm) || 0);
  if (d === 0) return nominal;
  if (d <= 2) return nominal * 0.68;
  if (d <= 5) return nominal * 0.78;
  if (d <= 10) return nominal * 0.88;
  return nominal * 0.95;
}

/**
 * Smart ETA. `context` اختياري ويتيح إضافة ضغط الطلبات/التأخير التاريخي من أي
 * مسار يملك هذه البيانات، مع بقاء الدالة قابلة للاستخدام مباشرة من order.service.
 */
function estimateEtaMinutes(distanceKm, vehicleType = 'motorcycle', context = {}) {
  const d = Math.max(0, Number(distanceKm) || 0);
  const speed = effectiveUrbanSpeed(d, vehicleType);
  const travelMinutes = d === 0 ? 0 : (d / speed) * 60;
  const demandFactor = Math.max(1, Math.min(1.5, Number(context.demandFactor) || 1));
  const historicalDelay = Math.max(0, Math.min(30, Number(context.historicalDelayMinutes) || 0));
  const weatherBuffer = Math.max(0, Math.min(20, Number(context.weatherBufferMinutes) || 0));
  return Math.max(1, Math.round(travelMinutes * demandFactor + PREP_MINUTES + historicalDelay + weatherBuffer));
}

function etaBreakdown(distanceKm, vehicleType = 'motorcycle', context = {}) {
  const d = Math.max(0, Number(distanceKm) || 0);
  const speed = effectiveUrbanSpeed(d, vehicleType);
  const baseTravel = d === 0 ? 0 : (d / speed) * 60;
  const demandFactor = Math.max(1, Math.min(1.5, Number(context.demandFactor) || 1));
  const historicalDelay = Math.max(0, Math.min(30, Number(context.historicalDelayMinutes) || 0));
  const weatherBuffer = Math.max(0, Math.min(20, Number(context.weatherBufferMinutes) || 0));
  return {
    distanceKm: d,
    effectiveSpeedKmh: Number(speed.toFixed(1)),
    travelMinutes: Math.round(baseTravel * demandFactor),
    pickupBufferMinutes: PREP_MINUTES,
    historicalDelayMinutes: historicalDelay,
    weatherBufferMinutes: weatherBuffer,
    totalMinutes: estimateEtaMinutes(d, vehicleType, context),
  };
}

const DELAY_GRACE_MINUTES = 10;

function deliveryDueAt(order) {
  if (!order) return null;
  const start = order.timeline?.acceptedAt || order.timeline?.assignedAt || order.createdAt || null;
  const eta = Number(order.etaMinutes) || 0;
  if (!start || eta <= 0) return null;
  return new Date(start).getTime() + eta * 60_000;
}

function isOrderDelayed(order, now = Date.now(), graceMinutes = DELAY_GRACE_MINUTES) {
  const due = deliveryDueAt(order);
  if (due == null) return false;
  const t = now instanceof Date ? now.getTime() : Number(now);
  return t > due + graceMinutes * 60_000;
}

module.exports = {
  estimateEtaMinutes,
  etaBreakdown,
  effectiveUrbanSpeed,
  SPEEDS,
  deliveryDueAt,
  isOrderDelayed,
  DELAY_GRACE_MINUTES,
};
