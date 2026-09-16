'use strict';

const mongoose = require('mongoose');

const menuItemSchema = new mongoose.Schema(
  {
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    category: { type: String, default: '', trim: true },
    price: { type: Number, required: true, min: 0 },
    variants: [{
      label: { type: String, required: true, trim: true },
      price: { type: Number, required: true, min: 0 },
      _id: false,
    }],
    optionGroups: [{
      name: { type: String, required: true, trim: true },
      required: { type: Boolean, default: false },
      multiple: { type: Boolean, default: false },
      minSelect: { type: Number, default: 0, min: 0 },
      maxSelect: { type: Number, default: 1, min: 1 },
      options: [{
        name: { type: String, required: true, trim: true },
        price: { type: Number, default: 0, min: 0 },
        available: { type: Boolean, default: true },
        _id: false,
      }],
      _id: false,
    }],

    // مخزون بسيط اختياري؛ عند تعطيله تبقى طريقة العمل القديمة كما هي.
    trackInventory: { type: Boolean, default: false },
    inventoryQty: { type: Number, default: 0, min: 0 },
    lowStockThreshold: { type: Number, default: 3, min: 0 },

    imageUrl: { type: String, default: '' },
    available: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

menuItemSchema.index({ restaurant: 1, category: 1, sortOrder: 1 });
module.exports = mongoose.model('MenuItem', menuItemSchema);
