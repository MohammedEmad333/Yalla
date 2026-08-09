'use strict';

const mongoose = require('mongoose');
const { ORDER_STATUS } = require('../utils/constants');

// موقع (نقطة استلام أو تسليم) — GeoJSON مع عنوان نصّي
const locationSchema = new mongoose.Schema(
  {
    address: { type: String, required: true },
    contactName: String,
    contactPhone: String,
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
  },
  { _id: false }
);

// موديل الطلب — الكيان المحوري في المنظومة
const orderSchema = new mongoose.Schema(
  {
    // العلاقات
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    captain: { type: mongoose.Schema.Types.ObjectId, ref: 'Captain', default: null, index: true },

    // نقطتا الاستلام والتسليم
    pickup: { type: locationSchema, required: true },
    dropoff: { type: locationSchema, required: true },

    // تفاصيل الشحنة
    packageNote: { type: String, default: '' },   // وصف مختصر لما يُوصَّل
    price: { type: Number, default: 0 },           // قيمة التوصيل
    distanceKm: { type: Number, default: 0 },      // المسافة التقديرية
    etaMinutes: { type: Number, default: 0 },      // الزمن التقديري للتوصيل (دقائق)

    // وقت الجدولة (اختياري) — إن وُجد فالطلب مؤجّل حتى هذا الوقت
    scheduledAt: { type: Date, default: null, index: true },
    // هل فُعّل الطلب المجدول بعد حلول وقته؟ (يمنع المعالجة المكرّرة)
    scheduledActivated: { type: Boolean, default: false },

    // التسوية المالية (تُحسب عند التسليم — نموذج COD)
    commission: { type: Number, default: 0 },      // عمولة الشركة
    captainNet: { type: Number, default: 0 },      // صافي الكابتن

    // الكباتن الذين رفضوا الطلب — يُستبعدون عند إعادة الإسناد التلقائي
    rejectedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Captain' }],

    // حالة الطلب — محور المنطق اللحظي
    status: {
      type: String,
      enum: Object.values(ORDER_STATUS),
      default: ORDER_STATUS.PENDING,
      index: true,
    },

    // طوابع زمنية لكل مرحلة (مفيدة للتحليلات)
    timeline: {
      assignedAt: Date,
      acceptedAt: Date,
      pickedUpAt: Date,
      deliveredAt: Date,
      cancelledAt: Date,
    },

    cancelReason: { type: String, default: '' },

    // مفتاح منع التكرار — يضمن أنّ إعادة إرسال الطلب لا تُنشئ نسخة ثانية
    idempotencyKey: { type: String, default: undefined },

    // تقييم المستخدم للكابتن بعد التسليم (يُملأ مرّة واحدة)
    rating: {
      stars: { type: Number, min: 1, max: 5 },
      comment: { type: String, default: '' },
      ratedAt: Date,
    },
  },
  { timestamps: true }
);

// فريد لكل (مستخدم + مفتاح) — يُطبَّق فقط عند وجود المفتاح (sparse/partial)
orderSchema.index(
  { user: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } }
);

module.exports = mongoose.model('Order', orderSchema);
