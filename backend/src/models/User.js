'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES } = require('../utils/constants');

// موديل المستخدم (العميل الذي يطلب التوصيل)
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false }, // لا يُرجَع افتراضيًا
    role: { type: String, enum: [ROLES.USER, ROLES.ADMIN], default: ROLES.USER },

    // عناوين محفوظة للاستخدام السريع عند الطلب
    savedAddresses: [
      {
        label: String, // "المنزل"، "العمل"...
        address: String,
        location: {
          type: { type: String, enum: ['Point'], default: 'Point' },
          coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
        },
      },
    ],

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true } // createdAt / updatedAt تلقائيًا
);

// تشفير كلمة المرور عبر دالة مساعدة قبل الحفظ
userSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

// التحقق من كلمة المرور عند تسجيل الدخول
userSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
