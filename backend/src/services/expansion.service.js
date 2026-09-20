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
const MenuItem = require('../models/MenuItem');
const Merchant = require('../models/Merchant');
const Captain = require('../models/Captain');
const PromotionBanner = require('../models/PromotionBanner');
const { saveImage, deleteFileByUrl } = require('../utils/avatarStore');
const { WALLET_DIRECTION, WALLET_TX_TYPE, TOPUP_STATUS } = require('../utils/constants');

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function safeRegex(value) {
  return String(value || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function searchStores(query = {}) {
  const q = String(query.q || '').trim();
  const category = String(query.category || '').trim();
  const base = { active: true };
  if (category && category !== 'الكل') base.category = category;
  if (!q) return Restaurant.find(base).sort({ 'merchandising.featured': -1, sortOrder: 1, name: 1 }).limit(100).lean();

  const rx = new RegExp(safeRegex(q), 'i');
  const menuRestaurantIds = await MenuItem.distinct('restaurant', {
    available: true,
    $or: [{ name: rx }, { description: rx }, { category: rx }],
  });
  const filter = {
    ...base,
    $or: [
      { name: rx }, { description: rx }, { category: rx }, { _id: { $in: menuRestaurantIds } },
    ],
  };
  return Restaurant.find(filter)
    .sort({ 'merchandising.featured': -1, 'merchandising.popular': -1, sortOrder: 1, name: 1 })
    .limit(100)
    .lean();
}

async function publicBanners() {
  const now = new Date();
  return PromotionBanner.find({
    active: true,
    $and: [
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  }).populate('restaurant', 'name imageUrl active').sort({ sortOrder: 1, createdAt: -1 }).limit(20).lean();
}

async function adminBanners() {
  return PromotionBanner.find({}).populate('restaurant', 'name').sort({ sortOrder: 1, createdAt: -1 }).lean();
}

async function createBanner(adminId, payload = {}) {
  const title = String(payload.title || '').trim();
  if (!title) throw httpError('عنوان البانر مطلوب');
  const row = await PromotionBanner.create({
    title,
    subtitle: String(payload.subtitle || '').trim(),
    imageUrl: String(payload.imageUrl || '').trim(),
    restaurant: payload.restaurant || null,
    couponCode: String(payload.couponCode || '').trim().toUpperCase(),
    active: payload.active !== false,
    startsAt: payload.startsAt || null,
    endsAt: payload.endsAt || null,
    sortOrder: Number(payload.sortOrder) || 0,
  });
  await AuditLog.create({ actor: adminId, action: 'banner_create', entityType: 'PromotionBanner', entityId: String(row._id), summary: `إنشاء بانر: ${title}` });
  return row;
}

async function updateBanner(adminId, id, payload = {}) {
  const doc = { ...payload };
  if (doc.title !== undefined) doc.title = String(doc.title || '').trim();
  if (doc.couponCode !== undefined) doc.couponCode = String(doc.couponCode || '').trim().toUpperCase();
  const row = await PromotionBanner.findByIdAndUpdate(id, { $set: doc }, { new: true, runValidators: true });
  if (!row) throw httpError('البانر غير موجود', 404);
  await AuditLog.create({ actor: adminId, action: 'banner_update', entityType: 'PromotionBanner', entityId: String(row._id), summary: `تحديث بانر: ${row.title}` });
  return row;
}

async function setBannerImage(adminId, id, file) {
  if (!file) throw httpError('أرفق صورة الإعلان', 400);
  const row = await PromotionBanner.findById(id);
  if (!row) throw httpError('البانر غير موجود', 404);

  const url = await saveImage(file, {
    kind: 'promotion-banner',
    owner: row._id,
    ownerRole: 'promotion-banner',
  });
  const previous = row.imageUrl;
  row.imageUrl = url;
  await row.save();
  await deleteFileByUrl(previous);
  await AuditLog.create({
    actor: adminId,
    action: 'banner_image_update',
    entityType: 'PromotionBanner',
    entityId: String(row._id),
    summary: `تحديث صورة بانر: ${row.title}`,
  });
  return row;
}

async function deleteBanner(adminId, id) {
  const row = await PromotionBanner.findByIdAndDelete(id);
  if (!row) throw httpError('البانر غير موجود', 404);
  await deleteFileByUrl(row.imageUrl);
  await AuditLog.create({ actor: adminId, action: 'banner_delete', entityType: 'PromotionBanner', entityId: String(row._id), summary: `حذف بانر: ${row.title}` });
  return { ok: true };
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
      wallet: wallet._id,
      direction: WALLET_DIRECTION.CREDIT,
      type: WALLET_TX_TYPE.REFUND,
      amount: approvedRefund,
      balanceBefore: Math.max(0, Number(wallet.balance) - approvedRefund),
      balanceAfter: wallet.balance,
      status: TOPUP_STATUS.APPROVED,
      order: issue.order,
      review: { by: adminId, at: new Date(), note: `استرداد شكوى ${String(issue._id)}` },
    });
  }

  issue.status = status;
  issue.approvedRefund = approvedRefund;
  issue.adminNote = String(payload.adminNote || '').trim();
  if (['resolved', 'rejected'].includes(status)) issue.resolvedAt = new Date();
  await issue.save();
  await AuditLog.create({ actor: adminId, action: 'order_issue_update', entityType: 'OrderIssue', entityId: String(issue._id), summary: `تحديث شكوى إلى ${status}`, metadata: { approvedRefund } });
  return issue;
}

async function auditLogs(query = {}) {
  const filter = {};
  if (query.action) filter.action = query.action;
  return AuditLog.find(filter).populate('actor', 'name lastName phone').sort({ createdAt: -1 }).limit(300).lean();
}

async function systemHealth() {
  const db = mongoose.connection.readyState;
  const [users, captains, merchants, restaurants, openIssues] = await Promise.all([
    User.countDocuments({}), Captain.countDocuments({}), Merchant.countDocuments({}), Restaurant.countDocuments({}), OrderIssue.countDocuments({ status: { $in: ['open', 'reviewing'] } }),
  ]);
  return {
    api: 'ok', mongo: db === 1 ? 'ok' : 'degraded', mongoState: db,
    uptimeSeconds: Math.floor(process.uptime()),
    memoryMb: { rss: Math.round(process.memoryUsage().rss / 1048576), heapUsed: Math.round(process.memoryUsage().heapUsed / 1048576) },
    counts: { users, captains, merchants, restaurants, openIssues },
    timestamp: new Date().toISOString(),
  };
}

async function setMerchandising(adminId, restaurantId, payload = {}) {
  const merchandising = { featured: !!payload.featured, popular: !!payload.popular, isNew: !!payload.isNew };
  const restaurant = await Restaurant.findByIdAndUpdate(restaurantId, { $set: { merchandising } }, { new: true });
  if (!restaurant) throw httpError('المتجر غير موجود', 404);
  await AuditLog.create({ actor: adminId, action: 'restaurant_merchandising', entityType: 'Restaurant', entityId: String(restaurant._id), summary: 'تحديث إبراز المتجر', metadata: merchandising });
  return restaurant;
}

module.exports = {
  searchStores, publicBanners, adminBanners, createBanner, updateBanner, setBannerImage, deleteBanner,
  rewards, applyReferral,
  listIssues, createIssue, adminIssues, resolveIssue,
  auditLogs, systemHealth, setMerchandising,
};
