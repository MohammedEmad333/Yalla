'use strict';
const mongoose = require('mongoose');

const promotionBannerSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  subtitle: { type: String, default: '', trim: true },
  imageUrl: { type: String, default: '' },
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', default: null, index: true },
  couponCode: { type: String, default: '', uppercase: true, trim: true },
  active: { type: Boolean, default: true, index: true },
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  sortOrder: { type: Number, default: 0 },
}, { timestamps: true });

promotionBannerSchema.index({ active: 1, sortOrder: 1, createdAt: -1 });
module.exports = mongoose.model('PromotionBanner', promotionBannerSchema);
