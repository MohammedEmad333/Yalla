'use strict';

const mongoose = require('mongoose');

// محفظة المستخدم — سجلّ واحد لكل مستخدم يحمل الرصيد الحالي.
// الرصيد هو "مصدر الحقيقة" السريع؛ وتفاصيل كل حركة تُحفظ في WalletTransaction.
const walletSchema = new mongoose.Schema(
  {
    // مالك المحفظة (فريد — محفظة واحدة لكل مستخدم)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    // الرصيد الحالي بالشيكل (أعداد صحيحة، اتّساقًا مع تسعير الطلبات)
    balance: { type: Number, default: 0, min: 0 },

    currency: { type: String, default: 'ILS' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Wallet', walletSchema);
