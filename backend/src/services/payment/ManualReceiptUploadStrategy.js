'use strict';

const PaymentStrategy = require('./PaymentStrategy');
const { TOPUP_STATUS } = require('../../utils/constants');

/**
 * استراتيجية المرحلة 1: الشحن اليدوي برفع إيصال.
 *
 * المستخدم يحوّل المبلغ خارج التطبيق (بنك فلسطين/جوال باي/بال باي)، ثم يرفع
 * صورة الإيصال ورقم العملية. هذه الاستراتيجية تُنشئ حركة شحن بحالة "معلّقة"
 * ولا تضيف الرصيد — يبقى بانتظار موافقة الأدمن من لوحة التحكّم.
 *
 * لأنّ الطرق الثلاث يدوية حاليًا، نستخدم نفس الاستراتيجية لها جميعًا مع
 * تمرير مفتاح الطريقة (method) للتمييز في السجلّات والمراجعة.
 */
class ManualReceiptUploadStrategy extends PaymentStrategy {
  /** @param {string} method مفتاح طريقة الدفع (bank_of_palestine/jawwal_pay/palpay) */
  constructor(method) {
    super();
    this._method = method;
  }

  get key() {
    return this._method;
  }

  async initiateTopUp(ctx, { walletService }) {
    const { userId, amount, proof, idempotencyKey } = ctx;

    // إثبات التحويل مطلوب في المسار اليدوي
    if (!proof || (!proof.imageUrl && !proof.referenceNumber)) {
      throw Object.assign(
        new Error('صورة الإيصال أو رقم العملية مطلوب لإتمام الشحن'),
        { statusCode: 400 }
      );
    }

    // حركة معلّقة — لا يُضاف الرصيد حتى موافقة الأدمن
    return walletService.createTopupTransaction({
      userId,
      amount,
      method: this._method,
      status: TOPUP_STATUS.PENDING,
      proof,
      idempotencyKey,
    });
  }
}

module.exports = ManualReceiptUploadStrategy;
