'use strict';

const crypto = require('crypto');
const User = require('../models/User');
const Order = require('../models/Order');
const RewardSettings = require('../models/RewardSettings');
const { ORDER_STATUS } = require('../utils/constants');

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
  const pointsPerIls = Math.max(1, Number(cfg.pointsPerIls) || 100);
  const minOrderPoints = Math.max(0, Number(cfg.minRedeemPoints) || 0);
  const valueIls = Math.floor(points / pointsPerIls);
  return {
    points,
    valueIls,
    referralCode,
    referred: await User.countDocuments({ referredBy: user._id }),
    referralRewarded: !!user.referralRewarded,
    hasReferral: !!user.referredBy,
    usage: 'orders_only',
    rules: {
      referralRewardPoints: Number(cfg.referralRewardPoints) || 0,
      pointsPerIls,
      minOrderPoints,
      minRedeemPoints: minOrderPoints,
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

async function redeem() {
  throw httpError('نقاط Yalla مخصصة للخصم على الطلبات فقط ولا يمكن تحويلها إلى المحفظة', 400);
}

async function reserveForOrder(userId, requestedPoints, maxOrderIls) {
  let requested = Number(requestedPoints);
  if (!Number.isFinite(requested) || requested <= 0) {
    return { pointsUsed: 0, discountIls: 0, pointsPerIls: 0 };
  }

  const user = await User.findById(userId);
  if (!user) throw httpError('المستخدم غير موجود', 404);
  await settleReferralIfEligible(user);
  const cfg = await settings();
  if (!cfg.enabled) throw httpError('برنامج المكافآت متوقف حاليًا');

  const pointsPerIls = Math.max(1, Number(cfg.pointsPerIls) || 100);
  const minOrderPoints = Math.max(0, Number(cfg.minRedeemPoints) || 0);
  const available = Number(user.loyaltyPoints || 0);
  const maxIls = Math.max(0, Number(maxOrderIls) || 0);
  const maxPointsForOrder = Math.floor(maxIls) * pointsPerIls;

  requested = Math.floor(requested / pointsPerIls) * pointsPerIls;
  const points = Math.min(requested, available, maxPointsForOrder);
  if (points <= 0) throw httpError(`تحتاج ${pointsPerIls} نقطة على الأقل للحصول على خصم 1 ₪`);
  if (points < minOrderPoints) throw httpError(`الحد الأدنى لاستخدام النقاط في الطلب هو ${minOrderPoints} نقطة`);

  const debited = await User.findOneAndUpdate(
    { _id: userId, loyaltyPoints: { $gte: points } },
    { $inc: { loyaltyPoints: -points } },
    { new: true }
  );
  if (!debited) throw httpError('رصيد النقاط غير كافٍ');

  return { pointsUsed: points, discountIls: points / pointsPerIls, pointsPerIls };
}

// إرجاع حجز لم يرتبط بطلب (فشل تحقق الرصيد أو إنشاء الطلب).
async function releaseReservation(userId, points) {
  const value = Math.max(0, Number(points) || 0);
  if (!value) return 0;
  await User.findByIdAndUpdate(userId, { $inc: { loyaltyPoints: value } });
  return value;
}

async function refundOrderPoints(orderOrId) {
  const order = typeof orderOrId === 'object' && orderOrId?._id
    ? orderOrId
    : await Order.findById(orderOrId);
  if (!order) return { refunded: 0 };

  const used = Math.max(0, Number(order.rewardPointsUsed) || 0);
  const already = Math.max(0, Number(order.rewardPointsRefunded) || 0);
  const remaining = Math.max(0, used - already);
  if (!remaining) return { refunded: 0 };

  const claimed = await Order.findOneAndUpdate(
    { _id: order._id, rewardPointsRefunded: already },
    { $set: { rewardPointsRefunded: used } },
    { new: true }
  );
  if (!claimed) return { refunded: 0 };
  await User.findByIdAndUpdate(order.user, { $inc: { loyaltyPoints: remaining } });
  order.rewardPointsRefunded = used;
  return { refunded: remaining };
}

async function settleOrderDiscount(order, actualOrderTotal) {
  const reservedDiscount = Math.max(0, Number(order.rewardDiscount) || 0);
  const pointsPerIls = Math.max(1, Number(order.rewardPointsPerIls) || 1);
  const used = Math.max(0, Number(order.rewardPointsUsed) || 0);
  const alreadyRefunded = Math.max(0, Number(order.rewardPointsRefunded) || 0);
  const actualDiscount = Math.min(reservedDiscount, Math.max(0, Number(actualOrderTotal) || 0));

  const pointsNeeded = Math.min(used, Math.round(actualDiscount * pointsPerIls));
  const totalRefundTarget = Math.max(0, used - pointsNeeded);
  const extraRefund = Math.max(0, totalRefundTarget - alreadyRefunded);

  if (extraRefund > 0) {
    const claimed = await Order.findOneAndUpdate(
      { _id: order._id, rewardPointsRefunded: alreadyRefunded },
      { $set: { rewardPointsRefunded: totalRefundTarget, rewardDiscountApplied: actualDiscount } },
      { new: true }
    );
    if (claimed) {
      await User.findByIdAndUpdate(order.user, { $inc: { loyaltyPoints: extraRefund } });
      order.rewardPointsRefunded = totalRefundTarget;
    }
  }
  order.rewardDiscountApplied = actualDiscount;
  return { discountIls: actualDiscount, pointsRefunded: extraRefund };
}

async function getAdminSettings() {
  return settings();
}

async function updateAdminSettings(payload = {}) {
  const patch = {};
  if (payload.referralRewardPoints !== undefined) patch.referralRewardPoints = Math.max(0, Number(payload.referralRewardPoints) || 0);
  if (payload.pointsPerIls !== undefined) patch.pointsPerIls = Math.max(1, Number(payload.pointsPerIls) || 1);
  const minimum = payload.minOrderPoints !== undefined ? payload.minOrderPoints : payload.minRedeemPoints;
  if (minimum !== undefined) patch.minRedeemPoints = Math.max(0, Number(minimum) || 0);
  if (typeof payload.requireFirstCompletedOrder === 'boolean') patch.requireFirstCompletedOrder = payload.requireFirstCompletedOrder;
  if (typeof payload.enabled === 'boolean') patch.enabled = payload.enabled;
  return RewardSettings.findOneAndUpdate({ key: 'global' }, { $set: patch }, { new: true, upsert: true, setDefaultsOnInsert: true });
}

module.exports = {
  getRewards,
  applyReferral,
  redeem,
  reserveForOrder,
  releaseReservation,
  refundOrderPoints,
  settleOrderDiscount,
  getAdminSettings,
  updateAdminSettings,
  settleReferralIfEligible,
};
