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

    // وقت قراءة الرسالة (Card 56) — يُضبط عند تعليمها كمقروءة. تُحذف تلقائيًا بعد
    // يوم من هذا الوقت عبر فهرس TTL أدناه. تبقى الرسائل غير المقروءة (readAt = null)
    // خارج نطاق الحذف التلقائي لأن مُراقِب TTL في مونجو يتجاهل القيم غير التاريخية.
    readAt: { type: Date, default: null },
  },
  { timestamps: true } // createdAt = وقت الرسالة
);

supportMessageSchema.index({ user: 1, createdAt: 1 });

// Card 56: حذف تلقائي للرسائل المقروءة بعد يوم واحد (٨٦٤٠٠ ثانية) من لحظة قراءتها.
// TTL يعمل على الحقل التاريخي readAt فقط؛ الرسائل غير المقروءة لا تملك readAt فلا تُحذف.
supportMessageSchema.index({ readAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model('SupportMessage', supportMessageSchema);
