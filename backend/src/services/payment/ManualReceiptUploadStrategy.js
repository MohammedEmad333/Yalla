'use strict';

const PaymentStrategy = require('./PaymentStrategy');
const { TOPUP_STATUS } = require('../../utils/constants');

class ManualReceiptUploadStrategy extends PaymentStrategy {
  constructor(method) {
    super();
    this._method = method;
  }

  get key() {
    return this._method;
  }

  async initiateTopUp(ctx, { walletService }) {
    const { userId, amount, proof, idempotencyKey } = ctx;
    if (!proof || !proof.imageUrl) {
      throw Object.assign(
        new Error('صورة الإيصال مطلوبة لإتمام طلب الشحن'),
        { statusCode: 400 }
      );
    }
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
