'use strict';

const mongoose = require('mongoose');

// محفظة المستخدم — سجلّ واحد لكل مستخدم يحمل الرصيد الحالي.
// balance هو الرصيد الفعلي، وreservedBalance هو الجزء المحجوز لطلبات نشطة.
const walletSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    balance: { type: Number, default: 0, min: 0 },
    reservedBalance: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'ILS' },
  },
  { timestamps: true }
);

walletSchema.virtual('availableBalance').get(function availableBalance() {
  return Math.max(0, Number(this.balance || 0) - Number(this.reservedBalance || 0));
});

module.exports = mongoose.model('Wallet', walletSchema);
