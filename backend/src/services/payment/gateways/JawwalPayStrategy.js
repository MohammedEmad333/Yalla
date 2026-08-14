'use strict';

const PaymentStrategy = require('../PaymentStrategy');
const { PAYMENT_METHOD } = require('../../../utils/constants');

/**
 * (المرحلة 2 — هيكل جاهز) استراتيجية بوابة جوال باي الرسمية.
 *
 * عند تفعيل البوابة لاحقًا: نستبدل جسم initiateTopUp باستدعاء API/SDK جوال باي
 * لإنشاء عملية دفع، ونعالج التأكيد في handleGatewayCallback (Webhook) الذي
 * يضيف الرصيد تلقائيًّا عبر walletService — دون أيّ تعديل على منطق المحفظة.
 *
 * تسجيل هذه الاستراتيجية في السجلّ (registry) هو كلّ ما يلزم لتفعيلها؛ لهذا
 * تُركت غير مُفعّلة الآن (throw) حتى تتوفّر مفاتيح البوابة.
 */
class JawwalPayStrategy extends PaymentStrategy {
  get key() {
    return PAYMENT_METHOD.JAWWAL_PAY;
  }

  async initiateTopUp(/* ctx, deps */) {
    // مثال للتنفيذ المستقبلي:
    //   const session = await jawwalPayClient.createPayment({ amount, orderRef });
    //   return walletService.createTopupTransaction({
    //     userId, amount, method: this.key, gatewayResponse: session,
    //   });
    //   // ثم يُوجَّه المستخدم إلى session.redirectUrl لإتمام الدفع.
    throw Object.assign(
      new Error('بوابة جوال باي غير مفعّلة بعد (المرحلة 2)'),
      { statusCode: 501 }
    );
  }

  async handleGatewayCallback(/* payload, { walletService } */) {
    // مثال: التحقّق من التوقيع، مطابقة transactionId، ثم:
    //   await walletService.approveByGateway(txId, payload) → يضيف الرصيد تلقائيًّا.
    throw Object.assign(new Error('غير مُنفّذ بعد'), { statusCode: 501 });
  }
}

module.exports = JawwalPayStrategy;
