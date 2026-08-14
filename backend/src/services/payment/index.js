'use strict';

const ManualReceiptUploadStrategy = require('./ManualReceiptUploadStrategy');
const walletService = require('../wallet.service');
const { isSupportedMethod, normalizeAmount, PAYMENT_METHODS } = require('../../utils/topup');
const { PAYMENT_METHOD } = require('../../utils/constants');

/**
 * خدمة الدفع (PaymentService) — نقطة الدخول الموحّدة لشحن الرصيد.
 *
 * تحتفظ بسجلّ (registry) يربط كل طريقة دفع باستراتيجيتها، وتوزّع الطلب
 * على الاستراتيجية المناسبة. المحفظة لا تعرف تفاصيل أيّ طريقة — كلّ المعرفة
 * محبوسة داخل الاستراتيجيات.
 *
 * ── التوسّع للمرحلة 2 ──
 * عند تفعيل بوابة رسمية، غيّر تسجيل مفتاحها هنا فقط، مثال:
 *   const JawwalPayStrategy = require('./gateways/JawwalPayStrategy');
 *   register(new JawwalPayStrategy());
 * دون تعديل walletService أو المتحكّمات أو المسارات.
 */

// السجلّ: method -> instance من PaymentStrategy
const registry = new Map();

function register(strategy) {
  registry.set(strategy.key, strategy);
}

// ── التسجيل الحالي (المرحلة 1) ───────────────────────────────────
// الطرق الثلاث يدوية الآن، فنسجّلها بنفس استراتيجية رفع الإيصال.
register(new ManualReceiptUploadStrategy(PAYMENT_METHOD.BANK_OF_PALESTINE));
register(new ManualReceiptUploadStrategy(PAYMENT_METHOD.JAWWAL_PAY));
register(new ManualReceiptUploadStrategy(PAYMENT_METHOD.PALPAY));

// عند الانتقال للمرحلة 2 يكفي استبدال السطر المناسب أعلاه بـ:
//   const JawwalPayStrategy = require('./gateways/JawwalPayStrategy');
//   register(new JawwalPayStrategy());

/** الطرق المتاحة للعرض في التطبيق (بيانات الحساب + التعليمات). */
function getAvailableMethods() {
  return Object.values(PAYMENT_METHODS).map((m) => ({
    key: m.key,
    label: m.label,
    mode: m.mode,
    account: m.account,
    instructions: m.instructions,
  }));
}

/**
 * طلب شحن رصيد — يتحقّق من المدخلات ثم يفوّض للاستراتيجية.
 * @param {Object} input
 * @param {string} input.userId
 * @param {string} input.method
 * @param {number|string} input.amount
 * @param {Object} [input.proof] إثبات يدوي {imageUrl, referenceNumber, senderName, paidAt}
 * @param {string} [input.idempotencyKey]
 * @returns {Promise<Object>} حركة المحفظة المُنشأة
 */
async function requestTopUp({ userId, method, amount, proof = {}, idempotencyKey }) {
  if (!isSupportedMethod(method)) {
    throw Object.assign(new Error('طريقة دفع غير مدعومة'), { statusCode: 400 });
  }

  const parsed = normalizeAmount(amount);
  if (!parsed.ok) throw Object.assign(new Error(parsed.error), { statusCode: 400 });

  const strategy = registry.get(method);
  if (!strategy) {
    throw Object.assign(new Error('طريقة الدفع غير مفعّلة حاليًا'), { statusCode: 501 });
  }

  // حقن التبعيّات (walletService) لتبقى الاستراتيجيات قابلة للاختبار
  return strategy.initiateTopUp(
    { userId, amount: parsed.value, proof, idempotencyKey },
    { walletService }
  );
}

module.exports = {
  register,
  getAvailableMethods,
  requestTopUp,
  _registry: registry, // مكشوف للاختبارات فقط
};
