'use strict';
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  captainId: { type: mongoose.Schema.Types.ObjectId, ref: 'Captain', required: true, unique: true },
  telegramUserId: { type: String, required: true, unique: true },
  telegramChatId: { type: String, required: true },
  linkedAt: { type: Date, default: Date.now },
}, { timestamps: true });
module.exports = mongoose.model('TelegramCaptainLink', schema);
