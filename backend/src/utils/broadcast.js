'use strict';

// أدوات رسائل/إشعارات الأدمن الجماعية (Card 66) — دوال نقيّة قابلة للاختبار.
// يرسل الأدمن رسالة للجميع، أو لكل الكباتن، أو لكل الزبائن، أو لمستلِمين محدّدين.

const { BROADCAST_AUDIENCE } = require('./constants');

const VALID_AUDIENCES = Object.values(BROADCAST_AUDIENCE);

/**
 * التحقّق من مدخلات الرسالة الجماعية قبل الإرسال.
 * @param {{audience?:string, title?:string, body?:string, userIds?:string[], captainIds?:string[]}} p
 * @returns {string|null} رسالة الخطأ أو null عند الصلاحية
 */
function validateBroadcast(p = {}) {
  const audience = String(p.audience || '').trim();
  if (!VALID_AUDIENCES.includes(audience)) {
    return 'اختر جمهورًا صالحًا (الكل/الزبائن/الكباتن/محدّدون)';
  }
  const title = String(p.title || '').trim();
  if (!title) return 'عنوان الرسالة مطلوب';
  if (title.length > 120) return 'عنوان الرسالة طويل جدًا (١٢٠ حرفًا كحدّ أقصى)';

  const body = String(p.body || '').trim();
  if (body.length > 1000) return 'نص الرسالة طويل جدًا (١٠٠٠ حرف كحدّ أقصى)';

  // للجمهور المحدّد يجب اختيار مستلِم واحد على الأقلّ
  if (audience === BROADCAST_AUDIENCE.SPECIFIC) {
    const users = Array.isArray(p.userIds) ? p.userIds : [];
    const captains = Array.isArray(p.captainIds) ? p.captainIds : [];
    if (users.length === 0 && captains.length === 0) {
      return 'اختر مستلِمًا واحدًا على الأقلّ';
    }
  }
  return null;
}

/**
 * هل يشمل الجمهور فئة الزبائن؟
 * @param {string} audience
 * @param {string[]} userIds
 */
function includesUsers(audience, userIds = []) {
  return (
    audience === BROADCAST_AUDIENCE.ALL ||
    audience === BROADCAST_AUDIENCE.USERS ||
    (audience === BROADCAST_AUDIENCE.SPECIFIC && userIds.length > 0)
  );
}

/**
 * هل يشمل الجمهور فئة الكباتن؟
 * @param {string} audience
 * @param {string[]} captainIds
 */
function includesCaptains(audience, captainIds = []) {
  return (
    audience === BROADCAST_AUDIENCE.ALL ||
    audience === BROADCAST_AUDIENCE.CAPTAINS ||
    (audience === BROADCAST_AUDIENCE.SPECIFIC && captainIds.length > 0)
  );
}

module.exports = {
  VALID_AUDIENCES,
  validateBroadcast,
  includesUsers,
  includesCaptains,
};
