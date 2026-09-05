'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES } = require('../utils/constants');

// موديل المستخدم (العميل الذي يطلب التوصيل)
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true }, // الاسم الأول
    lastName: { type: String, trim: true, default: '' }, // اسم العائلة
    phone: { type: String, required: true, unique: true, trim: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false }, // لا يُرجَع افتراضيًا
    role: { type: String, enum: [ROLES.USER, ROLES.ADMIN], default: ROLES.USER },

    // Card 110: نطاق مناطق الأدمن — قائمة مدن يقتصر عليها هذا الأدمن (مثل
    // ['الوسطى','خانيونس','رفح'] لأدمن الوسطى والجنوب). فارغة = أدمن كامل الصلاحية
    // يرى كل الطلبات. تُطبَّق كمرشّح على طلبات لوحة التحكم (مدينة الاستلام/التسليم).
    regions: { type: [String], default: [] },

    // بيانات إضافية لصفحة "حسابي" (Card 17)
    avatarUrl: { type: String, default: '' }, // مسار الصورة الشخصية المرفوعة
    city: { type: String, default: '', trim: true }, // المدينة

    // Card 96: مكان السكن عند إنشاء الحساب — المحافظة (من قائمة محافظات غزة)
    // وتفاصيل العنوان النصّية. تظهر للأدمن في بيانات الزبائن.
    governorate: { type: String, default: '', trim: true }, // المحافظة
    address: { type: String, default: '', trim: true }, // تفاصيل العنوان

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

    // Card 80: حساب مؤقّت أُنشئ تلقائيًا لطلب خارجي من لوحة الأدمن (أو واتساب)
    // دون تسجيل من التطبيق. يُميَّز عن الحسابات الدائمة، ويُحذف تلقائيًا بعد
    // انتهاء طلبه (التسليم/الإلغاء) ما لم يُسجَّل من التطبيق قبل ذلك.
    isExternal: { type: Boolean, default: false },

    // رموز أجهزة FCM لإرسال الإشعارات
    deviceTokens: { type: [String], default: [] },
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
