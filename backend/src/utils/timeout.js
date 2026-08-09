'use strict';

// قواعد انتهاء مهلة قبول الطلب — دوال نقيّة قابلة للاختبار بحقن الوقت.

/**
 * هل انتهت مهلة قبول الإسناد؟
 * @param {Date|string|null} assignedAt  وقت الإسناد
 * @param {Date} now  الوقت المرجعي
 * @param {number} timeoutMs  المهلة بالملّي ثانية
 * @returns {boolean}
 */
function isAssignmentExpired(assignedAt, now, timeoutMs) {
  if (!assignedAt) return false;
  return now.getTime() - new Date(assignedAt).getTime() >= timeoutMs;
}

/**
 * تصفية الطلبات التي انتهت مهلة قبولها.
 * @param {Array<{timeline?:{assignedAt?:Date}}>} orders
 * @param {Date} now
 * @param {number} timeoutMs
 */
function filterExpiredAssignments(orders, now, timeoutMs) {
  return orders.filter((o) => isAssignmentExpired(o.timeline?.assignedAt, now, timeoutMs));
}

module.exports = { isAssignmentExpired, filterExpiredAssignments };
