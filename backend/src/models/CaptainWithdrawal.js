'use strict';

const mongoose = require('mongoose');
const { WITHDRAWAL_STATUS, WITHDRAWAL_METHOD } = require('../utils/constants');

// طلب سحب أموال من محفظة الكابتن (Card 19).
// دورة الحياة: pending → done (حوّل الأدمن وخُصم الرصيد) أو rejected.
const captainWithdrawalSchema = new mongoose.Schema(
  {
    captain: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Captain',
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 }, // المبلغ المطلوب سحبه (₪)
    method: {
      type: String,
      enum: Object.values(WITHDRAWAL_METHOD),
      required: true,
    },
    phone: { type: String, required: true, trim: true }, // رقم الجوال لاستلام التحويل
    status: {
      type: String,
      enum: Object.values(WITHDRAWAL_STATUS),
      default: WITHDRAWAL_STATUS.PENDING,
      index: true,
    },
    adminNote: { type: String, default: '' }, // ملاحظة الأدمن عند التنفيذ/الرفض
    processedAt: { type: Date, default: null }, // وقت التحويل/الرفض
  },
  { timestamps: true }
);

module.exports = mongoose.model('CaptainWithdrawal', captainWithdrawalSchema);
