'use strict';
const mongoose = require('mongoose');

const orderIssueSchema = new mongoose.Schema({
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['missing_item','wrong_item','quality','late','captain','payment','other'], default: 'other' },
  description: { type: String, required: true, trim: true },
  requestedRefund: { type: Number, default: 0, min: 0 },
  approvedRefund: { type: Number, default: 0, min: 0 },
  status: { type: String, enum: ['open','reviewing','resolved','rejected'], default: 'open', index: true },
  adminNote: { type: String, default: '' },
  resolvedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('OrderIssue', orderIssueSchema);
