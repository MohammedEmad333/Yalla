'use strict';

// يحوّل الأرقام العربية/الفارسية إلى إنجليزية ويحذف تنسيق العرض.
// نخزّن ونبحث عن رقم موحّد كي لا يفشل الدخول بسبب مسافة أو شرطة فقط.
function normalizePhone(value) {
  const arabic = '٠١٢٣٤٥٦٧٨٩';
  const persian = '۰۱۲۳۴۵۶۷۸۹';
  return String(value || '')
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(arabic.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String(persian.indexOf(digit)))
    .replace(/[^0-9+]/g, '')
    .replace(/(?!^)[+]/g, '');
}

// رقم حساب Yalla للمستخدم يُخزَّن بصيغة فلسطينية محلية موحّدة: 05xxxxxxxx.
// نقبل صيغ الإدخال الشائعة (+970 / 970 / 00970) ثم نحوّلها قبل التخزين أو الدفع.
function normalizePalestinianMobile(value) {
  let phone = normalizePhone(value);
  if (!phone) return '';

  if (phone.startsWith('+970')) phone = phone.slice(4);
  else if (phone.startsWith('00970')) phone = phone.slice(5);
  else if (phone.startsWith('970')) phone = phone.slice(3);

  // بعد حذف 970 تصبح الصيغة 5xxxxxxxx؛ أعد الصفر المحلي.
  if (/^5\d{8}$/.test(phone)) phone = `0${phone}`;

  return /^05\d{8}$/.test(phone) ? phone : '';
}

function isPalestinianMobile(value) {
  return Boolean(normalizePalestinianMobile(value));
}

module.exports = { normalizePhone, normalizePalestinianMobile, isPalestinianMobile };
