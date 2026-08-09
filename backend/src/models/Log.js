'use strict';

const mongoose = require('mongoose');

// سجل الأحداث — نتتبّع كل انتقال في حالة الطلب / أفعال المنظومة للتدقيق والتحليلات
const logSchema = new mongoose.Schema(
  {
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', index: true },

    // من قام بالفعل (مستخدم / كابتن / أدمن) ونوعه
    actorId: { type: mongoose.Schema.Types.ObjectId },
    actorRole: { type: String }, // user | captain | admin | system

    action: { type: String, required: true }, // مثال: ORDER_ASSIGNED, STATUS_CHANGED
    fromStatus: String,
    toStatus: String,

    // بيانات إضافية حرّة (موقع، ملاحظات...)
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true } // createdAt = وقت الحدث
);

module.exports = mongoose.model('Log', logSchema);
