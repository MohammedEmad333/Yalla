'use strict';

// تطبيع مفتاح منع التكرار (Idempotency-Key) — دالة نقيّة قابلة للاختبار.

/**
 * يُعيد مفتاحًا نظيفًا صالحًا أو null إن كان غائبًا/غير صالح.
 * @param {*} key
 * @returns {string|null}
 */
function normalizeIdempotencyKey(key) {
  if (typeof key !== 'string') return null;
  const trimmed = key.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return null; // فارغ أو طويل جدًا
  return trimmed;
}

module.exports = { normalizeIdempotencyKey };
