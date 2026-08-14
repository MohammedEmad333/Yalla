'use strict';

// أدوات نقيّة (Pure) لعمليات شحن الرصيد — بلا قاعدة بيانات ولا شبكة،
// لتكون قابلة للاختبار وحدويًّا وقابلة لإعادة الاستخدام بين المرحلتين.

const { TOPUP_STATUS, PAYMENT_METHOD } = require('./constants');

/**
 * كتالوج طرق الدفع المتاحة لشحن الرصيد.
 * يُعرَض للمستخدم في التطبيق (تعليمات التحويل + بيانات الحساب)، ويحدّد
 * أيضًا أيّ استراتيجية دفع تُفعَّل حاليًا (manual في المرحلة 1).
 *
 * ملاحظة: بيانات الحسابات هنا أمثلة — استبدلها بالبيانات الحقيقية أو
 * انقلها إلى متغيّرات البيئة قبل الإطلاق.
 */
// اسم صاحب الحساب ورقم الجوّال الموحّد للتحويل اليدوي (المرحلة 1)
const ACCOUNT_NAME = 'ابراهيم محمد عطا قنديل';
const ACCOUNT_PHONE = '0593456405';

const PAYMENT_METHODS = Object.freeze({
  [PAYMENT_METHOD.BANK_OF_PALESTINE]: {
    key: PAYMENT_METHOD.BANK_OF_PALESTINE,
    label: 'بنك فلسطين',
    color: '#A6192E', // لون العلامة (أحمر بنك فلسطين) — يُستخدم في واجهة التطبيق
    // حاليًا يدوي (رفع إيصال)؛ يتحوّل إلى 'gateway' في المرحلة 2
    mode: 'manual',
    account: {
      name: ACCOUNT_NAME,
      number: ACCOUNT_PHONE,
      iban: 'PS94PALS045441409460993000000',
    },
    instructions:
      'حوّل المبلغ إلى حساب بنك فلسطين أعلاه، ثم ارفع صورة الإيصال ورقم العملية.',
  },
  [PAYMENT_METHOD.JAWWAL_PAY]: {
    key: PAYMENT_METHOD.JAWWAL_PAY,
    label: 'جوال باي',
    color: '#00A651', // لون العلامة (أخضر جوال)
    mode: 'manual',
    account: { name: ACCOUNT_NAME, number: ACCOUNT_PHONE },
    instructions:
      'حوّل المبلغ عبر تطبيق جوال باي إلى الرقم أعلاه، ثم ارفع صورة الإيصال ورقم العملية.',
  },
  [PAYMENT_METHOD.PALPAY]: {
    key: PAYMENT_METHOD.PALPAY,
    label: 'بال باي',
    color: '#0072BC', // لون العلامة (أزرق بال باي)
    mode: 'manual',
    account: { name: ACCOUNT_NAME, number: ACCOUNT_PHONE },
    instructions:
      'حوّل المبلغ عبر بال باي إلى الحساب أعلاه، ثم ارفع صورة الإيصال ورقم العملية.',
  },
});

// الحدّ الأدنى والأقصى لمبلغ الشحن الواحد (بالشيكل)
const MIN_TOPUP = 5;
const MAX_TOPUP = 5000;

/**
 * التحقّق من صحّة طريقة الدفع.
 * @param {string} method
 * @returns {boolean}
 */
function isSupportedMethod(method) {
  return Object.prototype.hasOwnProperty.call(PAYMENT_METHODS, method);
}

/**
 * تطبيع مبلغ الشحن والتحقّق منه.
 * @param {*} raw
 * @returns {{ ok:boolean, value?:number, error?:string }}
 */
function normalizeAmount(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return { ok: false, error: 'المبلغ غير صالح' };
  const value = Math.round(n); // نتعامل بالشيكل كأعداد صحيحة (اتّساقًا مع التسعير)
  if (value < MIN_TOPUP) return { ok: false, error: `الحدّ الأدنى للشحن ${MIN_TOPUP} ₪` };
  if (value > MAX_TOPUP) return { ok: false, error: `الحدّ الأقصى للشحن ${MAX_TOPUP} ₪` };
  return { ok: true, value };
}

/**
 * هل يُسمح بالانتقال من حالة شحن إلى أخرى؟
 * لا يُسمح بتغيير الحالة إلّا من pending (منعًا للموافقة/الرفض المكرّر).
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
function canTransition(from, to) {
  if (from !== TOPUP_STATUS.PENDING) return false;
  return to === TOPUP_STATUS.APPROVED || to === TOPUP_STATUS.REJECTED;
}

/**
 * حساب الرصيد بعد إضافة/خصم مبلغ، مع منع القيم السالبة.
 * @param {number} balance
 * @param {number} amount موجب = إضافة، سالب = خصم
 * @returns {{ ok:boolean, balance?:number, error?:string }}
 */
function applyToBalance(balance, amount) {
  const next = (Number(balance) || 0) + Number(amount);
  if (next < 0) return { ok: false, error: 'الرصيد غير كافٍ' };
  return { ok: true, balance: next };
}

module.exports = {
  PAYMENT_METHODS,
  MIN_TOPUP,
  MAX_TOPUP,
  isSupportedMethod,
  normalizeAmount,
  canTransition,
  applyToBalance,
};
