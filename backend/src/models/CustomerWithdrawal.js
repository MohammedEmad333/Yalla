'use strict';

const mongoose = require('mongoose');
const { WITHDRAWAL_STATUS } = require('../utils/constants');

// Card 98: طلب سحب رصيد من محفظة الزبون إلى محفظة إلكترونية أو بنك يذكره في الطلب.
// دورة الحياة: pending → done (حوّل الأدمن الأموال وخُصمت من رصيد الزبون) أو rejected.
const customerWithdrawalSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    amount: { type: Number, required: true, min: 0 }, // المبلغ المطلوب سحبه (₪)

    // وجهة التحويل كما يذكرها الزبون: اسم المحفظة الإلكترونية أو البنك، ورقم الحساب،
    // واسم صاحب الحساب (اختياري) — الأدمن يستخدمها لإرسال الأموال يدويًا.
    destination: { type: String, required: true, trim: true }, // اسم المحفظة/البنك
    accountNumber: { type: String, required: true, trim: true }, // رقم الحساب/المحفظة
    accountOwner: { type: String, default: '', trim: true }, // اسم صاحب الحساب
    note: { type: String, default: '', trim: true }, // ملاحظة الزبون

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

module.exports = mongoose.model('CustomerWithdrawal', customerWithdrawalSchema);
