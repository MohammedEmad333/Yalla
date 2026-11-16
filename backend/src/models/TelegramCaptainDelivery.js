'use strict';
const mongoose = require('mongoose');

// A bounded delivery ledger, not an outbox. Hash keys avoid storing chat IDs,
// order details or Telegram payloads in this collection.
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  state: { type: String, enum: ['sending', 'sent'], required: true },
  leaseToken: { type: String },
  leaseUntil: { type: Date },
  sentAt: { type: Date },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('TelegramCaptainDelivery', schema);
