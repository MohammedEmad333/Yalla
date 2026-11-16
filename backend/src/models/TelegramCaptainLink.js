'use strict';
const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  captainId: { type: mongoose.Schema.Types.ObjectId, ref: 'Captain', required: true, unique: true },
  telegramUserId: { type: String, required: true, unique: true },
  telegramChatId: { type: String, required: true },
  linkedAt: { type: Date, default: Date.now },
  notificationPreferences: {
    assigned: { type: Boolean, default: true },
    status: { type: Boolean, default: true },
  },
}, { timestamps: true });
module.exports = mongoose.model('TelegramCaptainLink', schema);
