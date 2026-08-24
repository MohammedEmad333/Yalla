'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Card 79: طلب توثيق كابتن مُقدَّم من التطبيق (تسجيل ذاتي).
// يجمع البيانات والمستندات ويبقى "قيد التوثيق" (pending) حتى يقبله الأدمن
// (فيُنشأ حساب الكابتن) أو يرفضه (فيُحذف الطلب نهائيًا). كلمة السر تُخزَّن
// مُشفَّرة لتُنقَل إلى حساب الكابتن عند القبول دون طلبها مجددًا.
const captainApplicationSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true }, // الاسم الرباعي
    phone: { type: String, required: true, trim: true, index: true },
    passwordHash: { type: String, required: true, select: false },

    nationalId: { type: String, required: true, trim: true }, // رقم الهوية
    birthDate: { type: Date, required: true },                 // تاريخ الميلاد
    idPhotoUrl: { type: String, required: true },              // صورة الهوية الرسمية
    selfieUrl: { type: String, required: true },               // سيلفي مع الهوية

    vehicleType: { type: String, enum: ['bicycle', 'motorcycle'], default: 'motorcycle' },

    // pending فقط تُعرض للأدمن؛ القبول يُنشئ الكابتن والرفض يحذف الطلب،
    // فلا يبقى في العادة إلا الطلبات المعلّقة.
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
  },
  { timestamps: true }
);

captainApplicationSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

module.exports = mongoose.model('CaptainApplication', captainApplicationSchema);
