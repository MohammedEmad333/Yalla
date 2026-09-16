'use strict';

const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const Order = require('../models/Order');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const OrderIssue = require('../models/OrderIssue');
const AuditLog = require('../models/AuditLog');
const Restaurant = require('../models/Restaurant');
const Merchant = require('../models/Merchant');
const Captain = require('../models/Captain');
const { WALLET_DIRECTION, WALLET_TX_TYPE } = require('../utils/constants');

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

async function ensureReferralCode(user) {
  if (user.referralCode) return user.referralCode;
  for (let i = 0; i < 8; i += 1) {
    const code = `Y${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    const exists = await User.exists({ referralCode: code });
    if (!exists) {
      user.referralCode = code;
      await user.save();
      return code;
    }
  }
  throw httpError('تعذّر إنشاء رمز إحالة');
}

async function rewards(userId) {
  const user = await User.findById(userId);
  if (!user) throw httpError('المستخدم غير موجود', 404);
  const referralCode = await ensureReferralCode(user);
  return {
    points: Number(user.loyaltyPoints || 0),
    referralCode,
    referred: await User.countDocuments({ referredBy: user._id }),
    // القاعدة الحالية: كل 100 نقطة = 1 ₪ عند الاستبدال مستقبلاً.
    valueIls: Math.floor(Number(user.loyaltyPoints || 0) / 100),
  };
}

async function applyReferral(userId, code) {
  const user = await User.findById(userId);
  if (!user) throw httpError('المستخدم غير موجود', 404);
  if (user.referredBy) throw httpError('تم استخدام رمز إحالة سابقًا');
  const normalized = String(code || '').trim().toUpperCase();
  const inviter = await User.findOne({ referralCode: normalized, _id: { $ne: user._id }, role: 'user' });
  if (!inviter) throw httpError('رمز الإحالة غير صالح', 404);
  user.referredBy = inviter._id;
  user.loyaltyPoints = Number(user.loyaltyPoints || 0) + 100;
  inviter.loyaltyPoints = Number(inviter.loyaltyPoints || 0) + 100;
  await Promise.all([user.save(), inviter.save()]);
  return rewards(userId);
}

async function listIssues(userId) {
  return OrderIssue.find({ user: userId }).populate('order', 'status store price finalPrice createdAt').sort({ createdAt: -1 }).lean();
}

async function createIssue(userId, payload = {}) {
  const order = await Order.findOne({ _id: payload.orderId, user: userId }).lean();
  if (!order) throw httpError('الطلب غير موجود', 404);
  const description = String(payload.description || '').trim();
  if (description.length < 5) throw httpError('اكتب وصف المشكلة بشكل أوضح');
  return OrderIssue.create({
    order: order._id,
    user: userId,
    type: payload.type || 'other',
    description,
    requestedRefund: Math.max(0, Number(payload.requestedRefund) || 0),
  });
}

async function adminIssues(query = {}) {
  const filter = {};
  if (query.status && query.status !== 'all') filter.status = query.status;
  return OrderIssue.find(filter)
    .populate('user', 'name lastName phone')
    .populate('order', 'status store price finalPrice customerCharged createdAt')
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();
}

async function resolveIssue(adminId, issueId, payload = {}) {
  const issue = await OrderIssue.findById(issueId);
  if (!issue) throw httpError('الشكوى غير موجودة', 404);
  const status = String(payload.status || 'resolved');
  if (!['reviewing', 'resolved', 'rejected'].includes(status)) throw httpError('حالة غير صالحة');
  const approvedRefund = Math.max(0, Number(payload.approvedRefund) || 0);

  if (status === 'resolved' && approvedRefund > 0 && issue.approvedRefund <= 0) {
    const order = await Order.findById(issue.order).lean();
    if (!order) throw httpError('الطلب غير موجود', 404);
    const maxRefund = Math.max(0, Number(order.customerCharged || order.finalPrice || order.price || 0));
    if (approvedRefund > maxRefund) throw httpError('قيمة الاسترداد أكبر من المبلغ المدفوع');
    const wallet = await Wallet.findOneAndUpdate(
      { user: issue.user },
      { $inc: { balance: approvedRefund }, $setOnInsert: { currency: 'ILS' } },
      { new: true, upsert: true }
    );
    await WalletTransaction.create({
      user: issue.user,
      direction: WALLET_DIRECTION.CREDIT,
      type: WALLET_TX_TYPE.REFUND,
      amount: approvedRefund,
      balanceAfter: wallet.balance,
      note: `استرداد شكوى الطلب ${String(issue.order)}`,
      order: issue.order,
    }).catch(() => null);
  }

  issue.status = status;
  issue.approvedRefund = approvedRefund;
  issue.adminNote = String(payload.adminNote || '').trim();
  if (['resolved', 'rejected'].includes(status)) issue.resolvedAt = new Date();
  await issue.save();
  await AuditLog.create({
    actor: adminId,
    action: 'order_issue_update',
    entityType: 'OrderIssue',
    entityId: String(issue._id),
    summary: `تحديث شكوى إلى ${status}`,
    metadata: { approvedRefund },
  });
  return issue;
}

async function auditLogs(query = {}) {
  const filter = {};
  if (query.action) filter.action = query.action;
  return AuditLog.find(filter).populate('actor', 'name lastName phone').sort({ createdAt: -1 }).limit(300).lean();
}

async function systemHealth() {
  const started = process.uptime();
  const db = mongoose.connection.readyState;
  const [users, captains, merchants, restaurants, openIssues] = await Promise.all([
    User.countDocuments({}), Captain.countDocuments({}), Merchant.countDocuments({}), Restaurant.countDocuments({}), OrderIssue.countDocuments({ status: { $in: ['open', 'reviewing'] } }),
  ]);
  return {
    api: 'ok',
    mongo: db === 1 ? 'ok' : 'degraded',
    mongoState: db,
    uptimeSeconds: Math.floor(started),
    memoryMb: {
      rss: Math.round(process.memoryUsage().rss / 1048576),
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1048576),
    },
    counts: { users, captains, merchants, restaurants, openIssues },
    timestamp: new Date().toISOString(),
  };
}

async function setMerchandising(adminId, restaurantId, payload = {}) {
  const merchandising = {
    featured: !!payload.featured,
    popular: !!payload.popular,
    isNew: !!payload.isNew,
  };
  const restaurant = await Restaurant.findByIdAndUpdate(restaurantId, { $set: { merchandising } }, { new: true });
  if (!restaurant) throw httpError('المتجر غير موجود', 404);
  await AuditLog.create({ actor: adminId, action: 'restaurant_merchandising', entityType: 'Restaurant', entityId: String(restaurant._id), summary: 'تحديث إبراز المتجر', metadata: merchandising });
  return restaurant;
}

module.exports = {
  rewards, applyReferral,
  listIssues, createIssue, adminIssues, resolveIssue,
  auditLogs, systemHealth, setMerchandising,
};
