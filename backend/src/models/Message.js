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
    // يشمل 'admin' لمشاركة الأدمن في المحادثة بأيقونة خاصة (Card 32)
    senderRole: { type: String, enum: ['user', 'captain', 'admin'], required: true },
    text: { type: String, required: true, trim: true },

    // بعد انتهاء المحادثة (تسليم/إلغاء) تُؤرشَف بدل الحذف النهائي: يفقد الطرفان
    // الوصول إليها بينما يحتفظ الأدمن بها للمراقبة والتصدير CSV (Card 32).
    archived: { type: Boolean, default: false, index: true },
  },
  { timestamps: true } // createdAt = وقت الرسالة
);

module.exports = mongoose.model('Message', messageSchema);
