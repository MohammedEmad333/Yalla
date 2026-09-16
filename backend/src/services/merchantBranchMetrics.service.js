'use strict';

const Merchant = require('../models/Merchant');
const Order = require('../models/Order');
const MerchantSettlement = require('../models/MerchantSettlement');
const { ORDER_STATUS } = require('../utils/constants');

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function branchIds(merchant) {
  return [...new Set([merchant.restaurant, ...(merchant.restaurants || [])].filter(Boolean).map(String))];
}

async function context(merchantId, restaurantId) {
  const merchant = await Merchant.findById(merchantId).lean();
  if (!merchant || !merchant.isActive) throw httpError('حساب المتجر غير متاح', 403);
  const branch = String(restaurantId || merchant.activeRestaurant || merchant.restaurant || '');
  if (!branch || !branchIds(merchant).includes(branch)) throw httpError('الفرع غير تابع للحساب', 403);
  return { merchant, restaurantId: branch };
}

async function analytics(merchantId, restaurantId) {
  const ctx = await context(merchantId, restaurantId);
  const now = new Date();
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
  const start7 = new Date(now.getTime() - 7 * 86400000);
  const start30 = new Date(now.getTime() - 30 * 86400000);
  const matchBase = { 'store.restaurant': ctx.merchant.restaurant?.constructor ? require('mongoose').Types.ObjectId.createFromHexString(ctx.restaurantId) : ctx.restaurantId, status: { $ne: ORDER_STATUS.CANCELLED } };
  // استخدم ObjectId صريحًا عند الإمكان، مع fallback للنص لاختبارات mock.
  let rid = ctx.restaurantId;
  try { rid = new (require('mongoose').Types.ObjectId)(ctx.restaurantId); } catch (_) {}
  matchBase['store.restaurant'] = rid;

  const [today, week, month, topItems, hourly] = await Promise.all([
    Order.aggregate([{ $match: { ...matchBase, createdAt: { $gte: startToday } } }, { $group: { _id: null, orders: { $sum: 1 }, sales: { $sum: '$store.itemsTotal' }, avg: { $avg: '$store.itemsTotal' } } }]),
    Order.aggregate([{ $match: { ...matchBase, createdAt: { $gte: start7 } } }, { $group: { _id: null, orders: { $sum: 1 }, sales: { $sum: '$store.itemsTotal' } } }]),
    Order.aggregate([{ $match: { ...matchBase, createdAt: { $gte: start30 } } }, { $group: { _id: null, orders: { $sum: 1 }, sales: { $sum: '$store.itemsTotal' }, avg: { $avg: '$store.itemsTotal' } } }]),
    Order.aggregate([{ $match: { ...matchBase, createdAt: { $gte: start30 } } }, { $unwind: '$store.items' }, { $group: { _id: '$store.items.name', qty: { $sum: '$store.items.qty' }, sales: { $sum: { $multiply: ['$store.items.price', '$store.items.qty'] } } } }, { $sort: { qty: -1 } }, { $limit: 8 }]),
    Order.aggregate([{ $match: { ...matchBase, createdAt: { $gte: start30 } } }, { $group: { _id: { $hour: '$createdAt' }, orders: { $sum: 1 } } }, { $sort: { orders: -1 } }, { $limit: 5 }]),
  ]);
  return {
    branchId: ctx.restaurantId,
    today: today[0] || { orders: 0, sales: 0, avg: 0 },
    week: week[0] || { orders: 0, sales: 0 },
    month: month[0] || { orders: 0, sales: 0, avg: 0 },
    topItems,
    busiestHours: hourly.map((x) => ({ hour: x._id, orders: x.orders })),
  };
}

async function finance(merchantId, restaurantId) {
  const ctx = await context(merchantId, restaurantId);
  let rid = ctx.restaurantId;
  try { rid = new (require('mongoose').Types.ObjectId)(ctx.restaurantId); } catch (_) {}
  const [grossAgg, settlements] = await Promise.all([
    Order.aggregate([{ $match: { 'store.restaurant': rid, status: ORDER_STATUS.DELIVERED } }, { $group: { _id: null, gross: { $sum: '$store.itemsTotal' }, orders: { $sum: 1 } } }]),
    MerchantSettlement.find({ restaurant: rid }).sort({ createdAt: -1 }).lean(),
  ]);
  const gross = grossAgg[0]?.gross || 0;
  const paid = settlements.filter((s) => s.status === 'paid').reduce((a, s) => a + Number(s.amount || 0), 0);
  const pending = settlements.filter((s) => s.status === 'pending').reduce((a, s) => a + Number(s.amount || 0), 0);
  return { branchId: ctx.restaurantId, gross, paid, pending, available: Math.max(0, Math.round((gross - paid - pending) * 100) / 100), settlements };
}

async function requestSettlement(merchantId, restaurantId, payload = {}) {
  const ctx = await context(merchantId, restaurantId);
  const current = await finance(merchantId, restaurantId);
  const amount = Math.round((Number(payload.amount) || 0) * 100) / 100;
  if (amount <= 0 || amount > current.available) throw httpError('المبلغ غير متاح للسحب');
  return MerchantSettlement.create({
    restaurant: ctx.restaurantId,
    merchant: ctx.merchant._id,
    amount,
    method: payload.method || 'cash',
    note: payload.note || '',
  });
}

module.exports = { analytics, finance, requestSettlement, context };
