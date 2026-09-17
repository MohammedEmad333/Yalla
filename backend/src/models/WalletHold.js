'use strict';

const mongoose = require('mongoose');

const walletHoldSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    wallet: { type: mongoose.Schema.Types.ObjectId, ref: 'Wallet', required: true, index: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true, index: true },
    amount: { type: Number, required: true, min: 0 },
    capturedAmount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['reserving', 'active', 'capturing', 'releasing', 'released'],
      default: 'reserving',
      index: true,
    },
    reason: { type: String, default: 'order', trim: true },
    releasedAt: { type: Date, default: null },
    releaseReason: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WalletHold', walletHoldSchema);
