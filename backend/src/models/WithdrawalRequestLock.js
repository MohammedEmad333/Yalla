'use strict';

const mongoose = require('mongoose');

// Distributed per-captain lock used while validating + creating a withdrawal request.
// It prevents two API instances (or two concurrent taps) from both reserving the same
// derived available balance. Expired locks are reclaimed explicitly by the service;
// TTL is only a cleanup safety net.
const withdrawalRequestLockSchema = new mongoose.Schema(
  {
    captain: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Captain',
      required: true,
      unique: true,
    },
    token: { type: String, required: true, trim: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

withdrawalRequestLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('WithdrawalRequestLock', withdrawalRequestLockSchema);
