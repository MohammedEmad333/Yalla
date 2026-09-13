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

module.exports = { normalizePhone };
