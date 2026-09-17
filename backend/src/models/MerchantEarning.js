'use strict';

const mongoose = require('mongoose');

// دفتر مستحقات المتاجر الناتجة عن الطلبات المسلّمة.
// هذا السجل منفصل عن MerchantSettlement الذي يمثّل عملية صرف/تسوية لاحقة.
const merchantEarningSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      unique: true,
      index: true,
    },
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
      index: true,
    },
    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Merchant',
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['available', 'settling', 'settled', 'reversed'],
      default: 'available',
      index: true,
    },
    availableAt: { type: Date, default: Date.now },
    settledAt: { type: Date, default: null },
    settlement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MerchantSettlement',
      default: null,
    },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

merchantEarningSchema.index({ merchant: 1, status: 1, createdAt: -1 });
merchantEarningSchema.index({ restaurant: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('MerchantEarning', merchantEarningSchema);
