'use strict';

const mongoose = require('mongoose');

/**
 * صنف في قائمة مطعم (Card 110) — السعر هنا هو مصدر الحقيقة؛ لا يُقبل أيّ سعر
 * يرسله العميل عند إنشاء الطلب.
 */
const menuItemSchema = new mongoose.Schema(
  {
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
      index: true,
    },

    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },

    // قسم داخل القائمة (ساندويشات، وجبات، مشروبات، حلويات...)
    category: { type: String, default: '', trim: true },

    price: { type: Number, required: true, min: 0 }, // بالشيكل
    imageUrl: { type: String, default: '' },

    // متاح الآن؟ (غير المتاح يظهر معطّلًا ولا يُقبل في السلّة)
    available: { type: Boolean, default: true },

    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// جلب قائمة مطعم مرتّبة بالقسم ثمّ الترتيب
menuItemSchema.index({ restaurant: 1, category: 1, sortOrder: 1 });

module.exports = mongoose.model('MenuItem', menuItemSchema);
