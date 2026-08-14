'use strict';

const PaymentStrategy = require('../PaymentStrategy');
const { PAYMENT_METHOD } = require('../../../utils/constants');

/**
 * (المرحلة 2 — هيكل جاهز) استراتيجية بوابة بنك فلسطين الرسمية.
 *
 * نفس فكرة JawwalPayStrategy: عند توفّر مفاتيح البوابة نستبدل الجسم
 * باستدعاء API البنك، ونعالج التأكيد التلقائي في handleGatewayCallback.
 * التفعيل يقتصر على تسجيل الاستراتيجية في السجلّ، بلا مساس بمنطق المحفظة.
 */
class BankOfPalestineStrategy extends PaymentStrategy {
  get key() {
    return PAYMENT_METHOD.BANK_OF_PALESTINE;
  }

  async initiateTopUp(/* ctx, deps */) {
    throw Object.assign(
      new Error('بوابة بنك فلسطين غير مفعّلة بعد (المرحلة 2)'),
      { statusCode: 501 }
    );
  }

  async handleGatewayCallback(/* payload, deps */) {
    throw Object.assign(new Error('غير مُنفّذ بعد'), { statusCode: 501 });
  }
}

module.exports = BankOfPalestineStrategy;
