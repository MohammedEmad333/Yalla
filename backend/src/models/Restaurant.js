'use strict';

const mongoose = require('mongoose');

const restaurantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    category: { type: String, default: 'مطاعم', trim: true, index: true },
    imageUrl: { type: String, default: '' },
    phone: { type: String, default: '' },
    ratingAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    city: { type: String, default: '', index: true },
    neighborhood: { type: String, default: '' },
    street: { type: String, default: '' },
    address: { type: String, default: '' },
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] },
    },
    minOrder: { type: Number, default: 0 },
    prepMinutes: { type: Number, default: 15 },
    isOpen: { type: Boolean, default: true },
    openTime: { type: String, default: '' },
    closeTime: { type: String, default: '' },

    // ضغط الطلبات: يبقى المتجر مفتوحًا لكن يضاف وقت تحضير مؤقت.
    busyUntil: { type: Date, default: null },
    busyExtraPrepMinutes: { type: Number, default: 0, min: 0, max: 180 },

    // جدول أسبوعي اختياري؛ إن كان اليوم غير موجود نرجع إلى openTime/closeTime.
    weeklyHours: [{
      day: { type: Number, min: 0, max: 6 }, // 0 الأحد .. 6 السبت
      open: { type: String, default: '' },
      close: { type: String, default: '' },
      closed: { type: Boolean, default: false },
      _id: false,
    }],

    // عرض بسيط يديره الشريك ويظهر للزبائن.
    promotion: {
      active: { type: Boolean, default: false },
      title: { type: String, default: '' },
      percent: { type: Number, default: 0, min: 0, max: 90 },
      minOrder: { type: Number, default: 0, min: 0 },
      endsAt: { type: Date, default: null },
    },

    // تحكم الأدمن في إبراز المتجر داخل الواجهة.
    merchandising: {
      featured: { type: Boolean, default: false },
      popular: { type: Boolean, default: false },
      isNew: { type: Boolean, default: false },
    },

    active: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

restaurantSchema.index({ location: '2dsphere' });
restaurantSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Restaurant', restaurantSchema);
