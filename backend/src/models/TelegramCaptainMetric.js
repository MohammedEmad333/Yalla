'use strict';
const mongoose = require('mongoose');

// Aggregated counters only: never store captain IDs, chat IDs, order IDs,
// Telegram payloads, credentials, or raw error descriptions.
const schema = new mongoose.Schema({
  day: { type: String, required: true },
  kind: { type: String, enum: ['assigned', 'status'], required: true },
  outcome: {
    type: String,
    enum: ['sent', 'duplicate', 'in_flight', 'failed', 'rate_limited', 'retried'],
    required: true,
  },
  count: { type: Number, required: true, min: 0, default: 0 },
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
schema.index({ day: 1, kind: 1, outcome: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('TelegramCaptainMetric', schema);
