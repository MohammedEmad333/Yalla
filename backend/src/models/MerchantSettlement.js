'use strict';

const mongoose = require('mongoose');

const merchantSettlementSchema = new mongoose.Schema({
  restaurant: { type: mongoose.Schema.Types.ObjectId, ref: 'Restaurant', required: true, index: true },
  merchant: { type: mongoose.Schema.Types.ObjectId, ref: 'Merchant', required: true, index: true },
  amount: { type: Number, required: true, min: 0.01 },
  status: { type: String, enum: ['pending', 'paid', 'rejected'], default: 'pending', index: true },
  method: { type: String, default: 'cash', trim: true },
  note: { type: String, default: '', trim: true },
  requestedAt: { type: Date, default: Date.now },
  processedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('MerchantSettlement', merchantSettlementSchema);
