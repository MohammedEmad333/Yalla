'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES } = require('../utils/constants');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    lastName: { type: String, trim: true, default: '' },
    phone: { type: String, required: true, unique: true, trim: true },
    email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: [ROLES.USER, ROLES.ADMIN], default: ROLES.USER },
    regions: { type: [String], default: [] },
    avatarUrl: { type: String, default: '' },
    city: { type: String, default: '', trim: true },
    governorate: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    savedAddresses: [{
      label: String,
      address: String,
      location: {
        type: { type: String, enum: ['Point'], default: 'Point' },
        coordinates: { type: [Number], default: [0, 0] },
      },
    }],

    // برنامج الولاء والإحالات.
    loyaltyPoints: { type: Number, default: 0, min: 0 },
    referralCode: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    referralRewarded: { type: Boolean, default: false },

    isActive: { type: Boolean, default: true },
    isExternal: { type: Boolean, default: false },
    deviceTokens: { type: [String], default: [] },
  },
  { timestamps: true }
);

userSchema.methods.setPassword = async function (plain) { this.passwordHash = await bcrypt.hash(plain, 10); };
userSchema.methods.verifyPassword = function (plain) { return bcrypt.compare(plain, this.passwordHash); };

module.exports = mongoose.model('User', userSchema);
