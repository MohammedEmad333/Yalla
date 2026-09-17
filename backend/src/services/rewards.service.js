'use strict';

const crypto = require('crypto');
const User = require('../models/User');
const Order = require('../models/Order');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const RewardSettings = require('../models/RewardSettings');
const { ORDER_STATUS, WALLET_DIRECTION, WALLET_TX_TYPE, TOPUP_STATUS } = require('../utils/constants');

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

async function settings() {
  let row = await RewardSettings.findOne({ key: 'global' });
  if (!row) row = await RewardSettings.create({ key: 'global' });
  return row;
}

async function ensureReferralCode(user) {
  if (user.referralCode) return user.referralCode;
  for (let i = 0; i < 8; i += 1) {
    const code = `Y${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    if (!(await User.exists({ referralCode: code }))) {
      user.referralCode = code;
      await user.save();
      return code;
    }
  }
  throw httpError('تعذّر إنشاء رمز إحالة');
}

async function hasCompletedOrder(userId) {
  return !!(await Order.exists({ user: userId, status: ORDER_STATUS.DELIVERED }));
}

async function settleReferralIfEligible(user) {
  if (!user?.referredBy || user.referralRewarded) return false;
  const cfg = await settings();
  if (!cfg.enabled) return false;
  if (cfg.requireFirstCompletedOrder && !(await hasCompletedOrder(user._id))) return false;

  const updated = await User.findOneAndUpdate(
    { _id: user._id, referralRewarded: false, referredBy: { $ne: null } },
    { $set: { referralRewarded: true }, $inc: { loyaltyPoints: Number(cfg.referralRewardPoints) || 0 } },
    { new: true }
  );
  if (!updated) return false;

  await User.findByIdAndUpdate(updated.referredBy, { $inc: { loyaltyPoints: Number(cfg.referralRewardPoints) || 0 } });
  user.referralRewarded = true;
  user.loyaltyPoints = updated.loyaltyPoints;
  return true;
}

async function getRewards(userId) {
  const user = await User.findById(userId);
  if (!user) throw httpError('المستخدم غير موجود', 404);
  await settleReferralIfEligible(user);
  const cfg = await settings();
  const referralCode = await ensureReferralCode(user);
  const points = Number(user.loyaltyPoints || 0);
  const valueIls = Math.floor(points / Math.max(1, Number(cfg.pointsPerIls) || 100));
  return {
    points,
    valueIls,
    referralCode,
    referred: await User.countDocuments({ referredBy: user._id }),
    referralRewarded: !!user.referralRewarded,
    hasReferral: !!user.referredBy,
    rules: {
      referralRewardPoints: Number(cfg.referralRewardPoints) || 0,
      pointsPerIls: Number(cfg.pointsPerIls) || 100,
      minRedeemPoints: Number(cfg.minRedeemPoints) || 0,
      requireFirstCompletedOrder: !!cfg.requireFirstCompletedOrder,
      enabled: !!cfg.enabled,
    },
  };
}

async function applyReferral(userId, code) {
  const user = await User.findById(userId);
  if (!user) throw httpError('المستخدم غير موجود', 404);
  if (user.referredBy) throw httpError('تم استخدام رمز إحالة سابقًا');

  const normalized = String(code || '').trim().toUpperCase();
  const inviter = await User.findOne({ referralCode: normalized, _id: { $ne: user._id }, role: 'user', isActive: true });
  if (!inviter) throw httpError('رمز الإحالة غير صالح', 404);

  user.referredBy = inviter._id;
  user.referralRewarded = false;
  await user.save();
  await settleReferralIfEligible(user);
  return getRewards(userId);
}

async function redeem(userId, requestedPoints) {
  const user = await User.findById(userId);
  if (!user) throw httpError('المستخدم غير موجود', 404);
  await settleReferralIfEligible(user);
  const cfg = await settings();
  if (!cfg.enabled) throw httpError('برنامج المكافآت متوقف حاليًا');

  const available = Number(user.loyaltyPoints || 0);
  const pointsPerIls = Math.max(1, Number(cfg.pointsPerIls) || 100);
  const min = Math.max(0, Number(cfg.minRedeemPoints) || 0);
  let points = Number(requestedPoints);
  if (!Number.isFinite(points) || points <= 0) points = available;
  points = Math.floor(points / pointsPerIls) * pointsPerIls;

  if (points < min) throw httpError(`الحد الأدنى للاستبدال هو ${min} نقطة`);
  if (points > available) throw httpError('رصيد النقاط غير كافٍ');

  const ils = points / pointsPerIls;
  if (ils <= 0) throw httpError('عدد النقاط غير كافٍ للاستبدال');

  const debited = await User.findOneAndUpdate(
    { _id: userId, loyaltyPoints: { $gte: points } },
    { $inc: { loyaltyPoints: -points } },
    { new: true }
  );
  if (!debited) throw httpError('رصيد النقاط غير كافٍ');

  try {
    const wallet = await Wallet.findOneAndUpdate(
      { user: userId },
      { $inc: { balance: ils }, $setOnInsert: { currency: 'ILS' } },
      { new: true, upsert: true }
    );
    await WalletTransaction.create({
      user: userId,
      wallet: wallet._id,
      direction: WALLET_DIRECTION.CREDIT,
      type: WALLET_TX_TYPE.ADJUSTMENT,
      amount: ils,
      balanceBefore: Number(wallet.balance) - ils,
      balanceAfter: wallet.balance,
      status: TOPUP_STATUS.APPROVED,
      review: { at: new Date(), note: `استبدال ${points} نقطة Yalla` },
      idempotencyKey: `reward-${Date.now()}-${userId}`,
    });
  } catch (err) {
    await User.findByIdAndUpdate(userId, { $inc: { loyaltyPoints: points } });
    throw err;
  }

  return getRewards(userId);
}

async function getAdminSettings() {
  return settings();
}

async function updateAdminSettings(payload = {}) {
  const patch = {};
  if (payload.referralRewardPoints !== undefined) patch.referralRewardPoints = Math.max(0, Number(payload.referralRewardPoints) || 0);
  if (payload.pointsPerIls !== undefined) patch.pointsPerIls = Math.max(1, Number(payload.pointsPerIls) || 1);
  if (payload.minRedeemPoints !== undefined) patch.minRedeemPoints = Math.max(0, Number(payload.minRedeemPoints) || 0);
  if (typeof payload.requireFirstCompletedOrder === 'boolean') patch.requireFirstCompletedOrder = payload.requireFirstCompletedOrder;
  if (typeof payload.enabled === 'boolean') patch.enabled = payload.enabled;
  return RewardSettings.findOneAndUpdate({ key: 'global' }, { $set: patch }, { new: true, upsert: true, setDefaultsOnInsert: true });
}

module.exports = { getRewards, applyReferral, redeem, getAdminSettings, updateAdminSettings, settleReferralIfEligible };
