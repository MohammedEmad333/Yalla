'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { CAPTAIN_STATUS } = require('../utils/constants');

// موديل الكابتن (سائق الدراجة/الموتوسيكل)
const captainSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true, select: false },

    // نوع المركبة ورقم اللوحة
    // Card 92: ثلاثة أنواع — هوائية (bicycle) / كهربائية (electric) / نارية (motorcycle)
    vehicleType: { type: String, enum: ['bicycle', 'electric', 'motorcycle'], default: 'motorcycle' },
    vehiclePlate: { type: String, trim: true },

    // الصورة الشخصية لصفحة "حسابي" (Card 17)
    avatarUrl: { type: String, default: '' },

    // ── بيانات توثيق الكابتن (Card 79) — حسّاسة، لا تُرجَع افتراضيًا ──────────
    // تظهر للأدمن فقط في صفحة "بيانات الكباتن". صورة الهوية والسيلفي تُستخدمان
    // للتوثيق ولا تظهران في الحساب العاديّ (select:false).
    nationalId: { type: String, default: '', select: false }, // رقم الهوية
    birthDate: { type: Date, default: null, select: false },   // تاريخ الميلاد
    idPhotoUrl: { type: String, default: '', select: false },  // صورة الهوية الرسمية
    selfieUrl: { type: String, default: '', select: false },   // سيلفي مع الهوية
    // مصدر إنشاء الحساب: 'admin' (أنشأه الأدمن) أو 'app' (سجّل من التطبيق ووُثّق)
    createdVia: { type: String, enum: ['admin', 'app'], default: 'admin' },

    // محافظ الكابتن الإلكترونية المحفوظة (Card 67) — رقم المحفظة واسم صاحبها
    // لكل تصنيف (بنك فلسطين/بال باي/جوال باي/الكل) ليعرفه الأدمن عند التحويل.
    payoutWallets: {
      type: [
        {
          category: { type: String, required: true }, // PAYOUT_WALLET_CATEGORY
          number: { type: String, required: true, trim: true }, // رقم المحفظة
          ownerName: { type: String, default: '', trim: true }, // اسم صاحب المحفظة
          _id: false,
        },
      ],
      default: [],
    },

    // حالة التوفّر — يتحكّم بها الكابتن من التطبيق
    status: {
      type: String,
      enum: Object.values(CAPTAIN_STATUS),
      default: CAPTAIN_STATUS.OFFLINE,
      index: true, // نبحث كثيرًا عن الكباتن المتاحين
    },

    // آخر موقع معروف — GeoJSON Point للبحث الجغرافي
    currentLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
      updatedAt: { type: Date, default: Date.now },
    },

    // الطلب النشط حاليًا (إن وُجد)
    activeOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },

    // رموز أجهزة FCM لإرسال الإشعارات (قد يملك الكابتن أكثر من جهاز)
    deviceTokens: { type: [String], default: [] },

    // متوسّط التقييم وعدد التقييمات (لحساب المتوسّط المتحرّك)
    rating: { type: Number, default: 5, min: 0, max: 5 },
    ratingsCount: { type: Number, default: 0 },

    // إجمالي عمولات الشركة التي سوّاها الكابتن (نموذج COD)
    settledCommission: { type: Number, default: 0 },

    isApproved: { type: Boolean, default: false }, // موافقة الأدمن على الكابتن
  },
  { timestamps: true }
);

// فهرس جغرافي لتمكين استعلامات "أقرب كابتن"
captainSchema.index({ currentLocation: '2dsphere' });

captainSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};
captainSchema.methods.verifyPassword = function (plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

module.exports = mongoose.model('Captain', captainSchema);
