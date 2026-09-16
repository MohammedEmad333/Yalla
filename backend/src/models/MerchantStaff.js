'use strict';
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const merchantStaffSchema = new mongoose.Schema({
  merchant: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant', required: true, index: true },
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
  name: { type: String, required: true, trim: true },
  phone: { type: String, required: true, unique: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['manager', 'cashier'], default: 'cashier' },
  active: { type: Boolean, default: true },
}, { timestamps: true });

merchantStaffSchema.methods.setPassword = async function (plain) { this.passwordHash = await bcrypt.hash(plain, 10); };
merchantStaffSchema.methods.verifyPassword = function (plain) { return bcrypt.compare(plain, this.passwordHash); };
merchantStaffSchema.index({ merchant: 1, phone: 1 }, { unique: true });

module.exports = mongoose.model('MerchantStaff', merchantStaffSchema);
