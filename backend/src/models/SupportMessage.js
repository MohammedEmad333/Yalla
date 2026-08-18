'use strict';

const mongoose = require('mongoose');

// رسالة دعم/تواصل مباشر بين الزبون والأدمن (Card 44 + Card 46).
// كل زبون له سلسلة محادثة واحدة مع الأدمن؛ الرسائل مستمرّة (لا تُحذف كدردشة الطلب).
const supportMessageSchema = new mongoose.Schema(
  {
    // صاحب المحادثة (الزبون) — نجمّع الرسائل حسبه
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    senderRole: { type: String, enum: ['user', 'admin'], required: true },
    text: { type: String, required: true, trim: true },

    // هل قرأ الطرف المقابل الرسالة؟ (لحساب غير المقروء لدى الأدمن)
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true } // createdAt = وقت الرسالة
);

supportMessageSchema.index({ user: 1, createdAt: 1 });

module.exports = mongoose.model('SupportMessage', supportMessageSchema);
