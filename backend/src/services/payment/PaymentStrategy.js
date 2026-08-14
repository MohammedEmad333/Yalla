'use strict';

/**
 * الواجهة الأساسية لاستراتيجيات الدفع (Strategy Pattern).
 *
 * كل طريقة شحن رصيد (رفع إيصال يدوي، جوال باي، بنك فلسطين...) تُنفّذ هذه
 * الواجهة. هدف النمط: إضافة بوابة دفع جديدة = صنف جديد يرث هذه الواجهة
 * ويُسجَّل في السجلّ (registry)، دون أيّ تعديل على منطق المحفظة الأساسي.
 *
 * JavaScript لا يملك واجهات صريحة، فنستخدم صنفًا أساسيًّا يرمي أخطاءً
 * لِما لم يُنفَّذ، بمثابة "عقد" يلتزم به كل صنف مشتقّ.
 */
class PaymentStrategy {
  /**
   * مفتاح الطريقة (يطابق PAYMENT_METHOD) — يُستخدم للتسجيل والاختيار.
   * @returns {string}
   */
  get key() {
    throw new Error('PaymentStrategy.key غير مُنفّذ');
  }

  /**
   * بدء عملية شحن رصيد.
   * @param {Object} ctx سياق العملية
   * @param {string} ctx.userId معرّف المستخدم صاحب المحفظة
   * @param {number} ctx.amount المبلغ (مطبَّع ومتحقَّق منه مسبقًا)
   * @param {Object} ctx.proof إثبات يدوي {imageUrl, referenceNumber, senderName, paidAt}
   * @param {string} [ctx.idempotencyKey] مفتاح منع التكرار
   * @param {Object} deps تبعيّات محقونة (walletService...) لتسهيل الاختبار
   * @returns {Promise<Object>} حركة المحفظة المُنشأة (WalletTransaction)
   */
  // eslint-disable-next-line no-unused-vars
  async initiateTopUp(ctx, deps) {
    throw new Error('PaymentStrategy.initiateTopUp غير مُنفّذ');
  }

  /**
   * (المرحلة 2) معالجة إشعار البوابة (Webhook/Callback) لتأكيد الدفع تلقائيًّا.
   * تبقى بلا تنفيذ في الاستراتيجيات اليدوية.
   * @param {Object} payload حمولة البوابة
   * @param {Object} deps تبعيّات محقونة
   */
  // eslint-disable-next-line no-unused-vars
  async handleGatewayCallback(payload, deps) {
    throw new Error('handleGatewayCallback غير مدعوم لهذه الطريقة');
  }
}

module.exports = PaymentStrategy;
