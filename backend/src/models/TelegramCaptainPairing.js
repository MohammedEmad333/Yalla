'use strict';
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  captainId: { type: mongoose.Schema.Types.ObjectId, ref: 'Captain', required: true, index: true },
  codeHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model('TelegramCaptainPairing', schema);
