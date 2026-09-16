'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// حساب الشريك. `restaurant` يبقى الفرع الأساسي للتوافق مع البيانات القديمة،
// و`restaurants` يحوي بقية الفروع التي يملكها نفس الحساب.
const merchantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    restaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
      unique: true,
      index: true,
    },
    restaurants: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant' }],
      default: [],
    },
    activeRestaurant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      default: null,
    },
    organizationName: { type: String, default: '', trim: true },
    isActive: { type: Boolean, default: true },
    deviceTokens: { type: [String], default: [] },
  },
  { timestamps: true }
);

merchantSchema.index({ restaurants: 1 });

merchantSchema.methods.setPassword = async function setPassword(plain) {
  this.passwordHash = await bcrypt.hash(plain, 10);
};

merchantSchema.methods.verifyPassword = function verifyPassword(plain) {
  return bcrypt.compare(plain, this.passwordHash);
};

module.exports = mongoose.model('Merchant', merchantSchema);
