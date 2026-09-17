'use strict';

const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
  title: { type: String, default: '', trim: true },
  type: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
  value: { type: Number, required: true, min: 0 },
  maxDiscount: { type: Number, default: 0, min: 0 },
  minOrder: { type: Number, default: 0, min: 0 },
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', default: null, index: true },
  active: { type: Boolean, default: true, index: true },
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  usageLimit: { type: Number, default: 0, min: 0 },
  usedCount: { type: Number, default: 0, min: 0 },
  // طلبات أُعيد عداد استخدامها بعد الإلغاء. يمنع إنقاص usedCount مرتين لنفس الطلب.
  restoredOrders: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Order', select: false }],
}, { timestamps: true });

module.exports = mongoose.model('Coupon', couponSchema);
