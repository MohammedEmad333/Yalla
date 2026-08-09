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

module.exports = { canUserCancel, USER_CANCELLABLE };
