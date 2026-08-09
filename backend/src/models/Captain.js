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
    vehicleType: { type: String, enum: ['bicycle', 'motorcycle'], default: 'motorcycle' },
    vehiclePlate: { type: String, trim: true },

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

    rating: { type: Number, default: 5, min: 0, max: 5 },
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
