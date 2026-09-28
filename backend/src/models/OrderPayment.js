'use strict';

const mongoose = require('mongoose');

const orderPaymentSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    provider: { type: String, enum: ['jawwal_pay'], default: 'jawwal_pay' },
    status: {
      type: String,
      enum: ['created', 'otp_sent', 'paid', 'failed', 'cancelled', 'refund_pending', 'refunded'],
      default: 'created',
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'ILS' },
    phone: { type: String, required: true },
    providerReference: { type: String, default: '', index: true },
    providerTransactionId: { type: String, default: '' },
    idempotencyKey: { type: String, required: true, unique: true },
    providerResponse: { type: mongoose.Schema.Types.Mixed, default: null },
    paidAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    failureReason: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('OrderPayment', orderPaymentSchema);
