'use strict';

const { ORDER_STATUS } = require('./constants');

// دوال قواعد نقيّة للطلب — قابلة للاختبار بلا قاعدة بيانات.

// الحالات التي يُسمح فيها للمستخدم بإلغاء طلبه (قبل الاستلام فقط)
const USER_CANCELLABLE = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.ASSIGNED,
  ORDER_STATUS.ACCEPTED,
];

/**
 * هل يمكن للمستخدم إلغاء طلب في هذه الحالة؟
 * بعد الاستلام (picked_up) لا يُسمح بالإلغاء لأن الشحنة في الطريق.
 */
function canUserCancel(status) {
  return USER_CANCELLABLE.includes(status);
}

// الحالات التي يُسمح فيها للكابتن برفض الطلب (قبل الاستلام فقط)
const CAPTAIN_REJECTABLE = [ORDER_STATUS.ASSIGNED, ORDER_STATUS.ACCEPTED];

/**
 * هل يمكن للكابتن رفض الطلب؟ (بعد الاستلام لا رفض — الشحنة معه)
 */
function canCaptainReject(status) {
  return CAPTAIN_REJECTABLE.includes(status);
}

module.exports = { canUserCancel, canCaptainReject, USER_CANCELLABLE, CAPTAIN_REJECTABLE };
