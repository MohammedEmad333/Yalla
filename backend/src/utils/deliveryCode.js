'use strict';

const crypto = require('crypto');

// رمز تسليم الطلب (Card 20) — منطق نقيّ قابل للاختبار.
// يُنشأ رمز من 4 أرقام عند إنشاء الطلب، يُعطى لصاحب الطلب، ويُطلب من الكابتن
// عند الضغط على "تم التسليم" لتأكيد وصول الشحنة ليده فعليًا.

const CODE_LENGTH = 4;

/**
 * توليد رمز تسليم عشوائي مكوّن من 4 أرقام (نصّ، مع أصفار بادئة إن لزم).
 * نستخدم مصدر عشوائية تشفيري لتفادي التخمين.
 * @returns {string} مثل "0473"
 */
function generateDeliveryCode() {
  const max = 10 ** CODE_LENGTH; // 10000
  const n = crypto.randomInt(0, max);
  return String(n).padStart(CODE_LENGTH, '0');
}

/**
 * التحقّق من تطابق الرمز المُدخَل مع رمز الطلب.
 * مقارنة نصّية متسامحة مع المسافات، وتتطلّب وجود رمز مُخزَّن أصلًا.
 * @param {string} expected  الرمز المُخزَّن على الطلب
 * @param {string} provided  الرمز الذي أدخله الكابتن
 * @returns {boolean}
 */
function verifyDeliveryCode(expected, provided) {
  if (!expected) return false;
  if (provided === undefined || provided === null) return false;
  return String(provided).trim() === String(expected).trim();
}

module.exports = { generateDeliveryCode, verifyDeliveryCode, CODE_LENGTH };
