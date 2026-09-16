'use strict';

const User = require('../models/User');
const Favorite = require('../models/Favorite');
const Coupon = require('../models/Coupon');
const Merchant = require('../models/Merchant');
const MerchantSettlement = require('../models/MerchantSettlement');
const Order = require('../models/Order');
const Restaurant = require('../models/Restaurant');
const Wallet = require('../models/Wallet');
const Captain = require('../models/Captain');
const { ORDER_STATUS } = require('../utils/constants');

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function cleanAddress(payload = {}) {
  const label = String(payload.label || '').trim() || 'عنوان';
  const address = String(payload.address || '').trim();
  const coords = payload.location?.coordinates;
  if (!address) throw httpError('العنوان مطلوب');
  if (!Array.isArray(coords) || coords.length !== 2 || !coords.every((v) => Number.isFinite(Number(v)))) {
    throw httpError('إحداثيات العنوان غير صالحة');
  }
  return { label, address, location: { type: 'Point', coordinates: coords.map(Number) } };
}

async function listAddresses(userId) {
  const user = await User.findById(userId).select('savedAddresses').lean();
  if (!user) throw httpError('المستخدم غير موجود', 404);
  return user.savedAddresses || [];
}

async function addAddress(userId, payload) {
  const user = await User.findById(userId);
  if (!user) throw httpError('المستخدم غير موجود', 404);
  user.savedAddresses.push(cleanAddress(payload));
  await user.save();
  return user.savedAddresses;
}

async function updateAddress(userId, addressId, payload) {
  const user = await User.findById(userId);
  if (!user) throw httpError('المستخدم غير موجود', 404);
  const row = user.savedAddresses.id(addressId);
  if (!row) throw httpError('العنوان غير موجود', 404);
  const next = cleanAddress({
    label: payload.label ?? row.label,
    address: payload.address ?? row.address,
    location: payload.location ?? row.location,
  });
  row.label = next.label;
  row.address = next.address;
  row.location = next.location;
  await user.save();
  return user.savedAddresses;
}

async function deleteAddress(userId, addressId) {
  const user = await User.findById(userId);
  if (!user) throw httpError('المستخدم غير موجود', 404);
  const row = user.savedAddresses.id(addressId);
  if (!row) throw httpError('العنوان غير موجود', 404);
  row.deleteOne();
  await user.save();
  return user.savedAddresses;
}

async function listFavorites(userId) {
  return Favorite.find({ user: userId }).populate('restaurant').sort({ createdAt: -1 }).lean();
}

async function toggleFavorite(userId, restaurantId) {
  const exists = await Restaurant.exists({ _id: restaurantId, active: true });
  if (!exists) throw httpError('المتجر غير موجود', 404);
  const current = await Favorite.findOne({ user: userId, restaurant: restaurantId });
  if (current) {
    await current.deleteOne();
    return { favorite: false };
  }
  await Favorite.create({ user: userId, restaurant: restaurantId });
  return { favorite: true };
}

async function reorder(userId, orderId) {
  const order = await Order.findOne({ _id: orderId, user: userId }).lean();
  if (!order) throw httpError('الطلب غير موجود', 404);
  if (!order.store?.restaurant || !order.store?.items?.length) throw httpError('هذا الطلب ليس طلب متجر', 400);
  return {
    restaurantId: String(order.store.restaurant),
    items: order.store.items.map((item) => ({
      menuItemId: String(item.menuItem), qty: item.qty, note: item.note || '', variant: item.variant || '',
      options: item.options || [],
    })),
    dropoff: order.dropoff,
    note: order.store.note || '',
  };
}

function couponDiscount(coupon, subtotal) {
  let discount = coupon.type === 'fixed' ? Number(coupon.value) : subtotal * Number(coupon.value) / 100;
  if (coupon.maxDiscount > 0) discount = Math.min(discount, coupon.maxDiscount);
  return Math.max(0, Math.min(subtotal, Math.round(discount * 100) / 100));
}

async function validateCoupon(code, subtotal, restaurantId) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return { valid: false, discount: 0, code: '' };
  const coupon = await Coupon.findOne({ code: normalized, active: true }).lean();
  if (!coupon) throw httpError('الكوبون غير صالح', 400);
  const now = new Date();
  if (coupon.startsAt && new Date(coupon.startsAt) > now) throw httpError('الكوبون لم يبدأ بعد', 400);
  if (coupon.endsAt && new Date(coupon.endsAt) < now) throw httpError('انتهت صلاحية الكوبون', 400);
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) throw httpError('تم استهلاك الكوبون', 400);
  if (coupon.restaurant && String(coupon.restaurant) !== String(restaurantId)) throw httpError('الكوبون غير متاح لهذا المتجر', 400);
  if (Number(subtotal) < Number(coupon.minOrder || 0)) throw httpError(`الحد الأدنى للكوبون ${coupon.minOrder} ₪`, 400);
  return { valid: true, coupon, code: coupon.code, discount: couponDiscount(coupon, Number(subtotal) || 0) };
}

async function consumeCoupon(couponId) {
  if (!couponId) return;
  await Coupon.updateOne({ _id: couponId }, { $inc: { usedCount: 1 } });
}

async function publicCoupons(restaurantId) {
  const now = new Date();
  return Coupon.find({
    active: true,
    $and: [
      { $or: [{ restaurant: null }, { restaurant: restaurantId }] },
      { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
      { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
    ],
  }).select('code title type value maxDiscount minOrder restaurant endsAt').lean();
}

async function adminListCoupons() { return Coupon.find({}).sort({ createdAt: -1 }).lean(); }
async function adminCreateCoupon(payload) {
  return Coupon.create({
    code: String(payload.code || '').trim().toUpperCase(), title: payload.title || '',
    type: payload.type === 'fixed' ? 'fixed' : 'percent', value: Number(payload.value) || 0,
    maxDiscount: Number(payload.maxDiscount) || 0, minOrder: Number(payload.minOrder) || 0,
    restaurant: payload.restaurant || null, active: payload.active !== false,
    startsAt: payload.startsAt || null, endsAt: payload.endsAt || null,
    usageLimit: Number(payload.usageLimit) || 0,
  });
}
async function adminUpdateCoupon(id, payload) {
  const doc = { ...payload };
  if (doc.code !== undefined) doc.code = String(doc.code).trim().toUpperCase();
  const row = await Coupon.findByIdAndUpdate(id, doc, { new: true, runValidators: true });
  if (!row) throw httpError('الكوبون غير موجود', 404);
  return row;
}

async function merchantContext(merchantId) {
  const merchant = await Merchant.findById(merchantId).lean();
  if (!merchant || !merchant.isActive) throw httpError('حساب المتجر غير متاح', 403);
  return merchant;
}

async function merchantAnalytics(merchantId) {
  const merchant = await merchantContext(merchantId);
  const restaurantId = merchant.restaurant;
  const now = new Date();
  const startToday = new Date(now); startToday.setHours(0, 0, 0, 0);
  const start7 = new Date(now.getTime() - 7 * 86400000);
  const matchBase = { 'store.restaurant': restaurantId, status: { $ne: ORDER_STATUS.CANCELLED } };
  const [today, week, topItems] = await Promise.all([
    Order.aggregate([{ $match: { ...matchBase, createdAt: { $gte: startToday } } }, { $group: { _id: null, orders: { $sum: 1 }, sales: { $sum: '$store.itemsTotal' }, avg: { $avg: '$store.itemsTotal' } } }]),
    Order.aggregate([{ $match: { ...matchBase, createdAt: { $gte: start7 } } }, { $group: { _id: null, orders: { $sum: 1 }, sales: { $sum: '$store.itemsTotal' } } }]),
    Order.aggregate([{ $match: matchBase }, { $unwind: '$store.items' }, { $group: { _id: '$store.items.name', qty: { $sum: '$store.items.qty' }, sales: { $sum: { $multiply: ['$store.items.price', '$store.items.qty'] } } } }, { $sort: { qty: -1 } }, { $limit: 5 }]),
  ]);
  return { today: today[0] || { orders: 0, sales: 0, avg: 0 }, week: week[0] || { orders: 0, sales: 0 }, topItems };
}

async function merchantFinance(merchantId) {
  const merchant = await merchantContext(merchantId);
  const restaurant = merchant.restaurant;
  const [grossAgg, settlements] = await Promise.all([
    Order.aggregate([{ $match: { 'store.restaurant': restaurant, status: ORDER_STATUS.DELIVERED } }, { $group: { _id: null, gross: { $sum: '$store.itemsTotal' }, orders: { $sum: 1 } } }]),
    MerchantSettlement.find({ restaurant }).sort({ createdAt: -1 }).lean(),
  ]);
  const gross = grossAgg[0]?.gross || 0;
  const paid = settlements.filter((s) => s.status === 'paid').reduce((a, s) => a + s.amount, 0);
  const pending = settlements.filter((s) => s.status === 'pending').reduce((a, s) => a + s.amount, 0);
  return { gross, paid, pending, available: Math.max(0, Math.round((gross - paid - pending) * 100) / 100), settlements };
}

async function requestMerchantSettlement(merchantId, payload = {}) {
  const merchant = await merchantContext(merchantId);
  const finance = await merchantFinance(merchantId);
  const amount = Math.round((Number(payload.amount) || 0) * 100) / 100;
  if (amount <= 0 || amount > finance.available) throw httpError('المبلغ غير متاح للسحب');
  return MerchantSettlement.create({ restaurant: merchant.restaurant, merchant: merchant._id, amount, method: payload.method || 'cash', note: payload.note || '' });
}

async function operationsAlerts() {
  const now = Date.now();
  const active = await Order.find({ status: { $nin: [ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED] } }).select('status captain store createdAt etaMinutes timeline pickup dropoff').sort({ createdAt: 1 }).limit(300).lean();
  const alerts = [];
  for (const order of active) {
    const ageMin = (now - new Date(order.createdAt).getTime()) / 60000;
    if (!order.captain && ageMin >= 5) alerts.push({ type: 'unassigned', severity: ageMin >= 12 ? 'critical' : 'warning', orderId: order._id, minutes: Math.floor(ageMin), message: `طلب بلا كابتن منذ ${Math.floor(ageMin)} دقيقة` });
    if (order.store?.restaurant && (order.store.merchantStatus || 'new') === 'new' && ageMin >= 5) alerts.push({ type: 'merchant_wait', severity: ageMin >= 10 ? 'critical' : 'warning', orderId: order._id, minutes: Math.floor(ageMin), message: `المتجر لم يقبل الطلب منذ ${Math.floor(ageMin)} دقيقة` });
    const eta = Number(order.etaMinutes) || 0;
    if (eta > 0 && ageMin > eta + 5) alerts.push({ type: 'delayed', severity: 'warning', orderId: order._id, minutes: Math.floor(ageMin - eta), message: `الطلب متأخر عن الوقت المتوقع` });
  }
  return alerts;
}

async function adminFinance() {
  const [delivered, settlements, walletBalances, captains] = await Promise.all([
    Order.aggregate([{ $match: { status: ORDER_STATUS.DELIVERED } }, { $group: { _id: null, orders: { $sum: 1 }, customerCharged: { $sum: '$customerCharged' }, adminCredit: { $sum: '$adminCredit' }, captainNet: { $sum: '$captainNet' }, merchantSales: { $sum: '$store.itemsTotal' } } }]),
    MerchantSettlement.aggregate([{ $group: { _id: '$status', total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    Wallet.aggregate([{ $group: { _id: null, total: { $sum: '$balance' }, wallets: { $sum: 1 } } }]),
    Captain.aggregate([{ $group: { _id: null, wallet: { $sum: '$walletBalance' }, owed: { $sum: '$amountOwed' } } }]),
  ]);
  const settlementMap = Object.fromEntries(settlements.map((x) => [x._id, { total: x.total, count: x.count }]));
  return { orders: delivered[0] || {}, merchantSettlements: settlementMap, customerWallets: walletBalances[0] || { total: 0, wallets: 0 }, captains: captains[0] || { wallet: 0, owed: 0 } };
}

async function adminListSettlements() {
  return MerchantSettlement.find({}).populate('restaurant', 'name').populate('merchant', 'name phone').sort({ createdAt: -1 }).lean();
}

async function adminProcessSettlement(id, status, note = '') {
  if (!['paid', 'rejected'].includes(status)) throw httpError('حالة غير صالحة');
  const row = await MerchantSettlement.findOneAndUpdate({ _id: id, status: 'pending' }, { status, note, processedAt: new Date() }, { new: true });
  if (!row) throw httpError('طلب التسوية غير موجود أو تمت معالجته', 404);
  return row;
}

module.exports = {
  listAddresses, addAddress, updateAddress, deleteAddress,
  listFavorites, toggleFavorite, reorder,
  validateCoupon, consumeCoupon, publicCoupons, adminListCoupons, adminCreateCoupon, adminUpdateCoupon,
  merchantAnalytics, merchantFinance, requestMerchantSettlement,
  operationsAlerts, adminFinance, adminListSettlements, adminProcessSettlement,
};
