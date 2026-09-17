'use strict';

const mongoose = require('mongoose');

const rewardSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'global', unique: true, index: true },
    referralRewardPoints: { type: Number, default: 100, min: 0 },
    pointsPerIls: { type: Number, default: 100, min: 1 },
    minRedeemPoints: { type: Number, default: 100, min: 0 },
    requireFirstCompletedOrder: { type: Boolean, default: true },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RewardSettings', rewardSettingsSchema);
