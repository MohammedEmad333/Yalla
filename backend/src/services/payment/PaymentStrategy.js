'use strict';

class PaymentStrategy {
  get key() {
    throw new Error('PaymentStrategy.key غير مُنفّذ');
  }

  async initiateTopUp(ctx, deps) {
    void ctx;
    void deps;
    throw new Error('PaymentStrategy.initiateTopUp غير مُنفّذ');
  }

  async handleGatewayCallback(payload, deps) {
    void payload;
    void deps;
    throw new Error('handleGatewayCallback غير مدعوم لهذه الطريقة');
  }
}

module.exports = PaymentStrategy;
