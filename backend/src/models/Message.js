'use strict';

const mongoose = require('mongoose');

// رسالة دردشة بين صاحب الطلب والكابتن خلال فترة التوصيل (Card 18).
// تُحذف كل رسائل الطلب فور تسليمه أو إلغائه.
const messageSchema = new mongoose.Schema(
  {
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    senderId: { type: mongoose.Schema.Types.ObjectId, required: true },
    senderRole: { type: String, enum: ['user', 'captain'], required: true },
    text: { type: String, required: true, trim: true },
  },
  { timestamps: true } // createdAt = وقت الرسالة
);

module.exports = mongoose.model('Message', messageSchema);
