'use strict';

const { ORDER_STATUS } = require('./constants');

// منطق الدردشة النقيّ (Card 18) — قابل للاختبار بلا قاعدة بيانات.
// الدردشة متاحة فقط خلال فترة التوصيل: بعد إسناد كابتن وقبل التسليم/الإلغاء.
// وتُحذف رسائلها بمجرّد تسليم الطلب أو إلغائه.

// الحالات التي تُسمح فيها الدردشة (يوجد كابتن مُسنَد والطلب ما زال جاريًا)
const CHATTABLE_STATUSES = Object.freeze([
  ORDER_STATUS.ASSIGNED,
  ORDER_STATUS.ACCEPTED,
  ORDER_STATUS.PICKED_UP,
]);

const MAX_MESSAGE_LENGTH = 1000;

/**
 * هل يُسمح بالدردشة على هذا الطلب الآن؟
 * @param {string} status  حالة الطلب
 * @returns {boolean}
 */
function canChat(status) {
  return CHATTABLE_STATUSES.includes(status);
}

/** هل هذه الحالة نهائية (تسليم/إلغاء) تستوجب حذف رسائل الطلب؟ */
function shouldPurgeMessages(status) {
  return status === ORDER_STATUS.DELIVERED || status === ORDER_STATUS.CANCELLED;
}

/**
 * التحقّق من نصّ الرسالة. يُعيد رسالة خطأ (نص) عند الفشل، أو null عند الصلاحية.
 * @param {string} text
 */
function validateMessage(text) {
  if (typeof text !== 'string') return 'نصّ الرسالة مطلوب';
  const trimmed = text.trim();
  if (trimmed.length === 0) return 'لا يمكن إرسال رسالة فارغة';
  if (trimmed.length > MAX_MESSAGE_LENGTH) return `الرسالة أطول من ${MAX_MESSAGE_LENGTH} حرف`;
  return null;
}

module.exports = {
  canChat,
  shouldPurgeMessages,
  validateMessage,
  CHATTABLE_STATUSES,
  MAX_MESSAGE_LENGTH,
};
