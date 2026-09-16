'use strict';

const Merchant = require('../models/Merchant');
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const Order = require('../models/Order');
const User = require('../models/User');
const Captain = require('../models/Captain');
const restaurantService = require('./restaurant.service');
const io = require('../sockets/io');
const { ORDER_STATUS, ROOMS, EVENTS } = require('../utils/constants');
const { normalizePhone } = require('../utils/phone');

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function merchantBranchIds(doc) {
  return [...new Set([doc.restaurant, ...(doc.restaurants || [])].filter(Boolean).map(String))];
}

function publicMerchant(doc, selectedRestaurant = null, branches = []) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    name: doc.name,
    phone: doc.phone,
    isActive: doc.isActive,
    organizationName: doc.organizationName || '',
    restaurant: selectedRestaurant || doc.restaurant,
    branches,
  };
}

async function getAdminMerchant(restaurantId) {
  const merchant = await Merchant.findOne({
    $or: [{ restaurant: restaurantId }, { restaurants: restaurantId }],
  }).lean();
  return merchant ? publicMerchant(merchant) : null;
}

async function upsertAdminMerchant(restaurantId, payload = {}) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw httpError('المطعم غير موجود', 404);
  const name = String(payload.name || '').trim();
  const phone = normalizePhone(payload.phone);
  const password = String(payload.password || '');
  if (!name) throw httpError('اسم صاحب المتجر مطلوب');
  if (!/^\+?\d{6,15}$/.test(phone)) throw httpError('أدخل رقم جوال صحيح');
  const [userCollision, captainCollision] = await Promise.all([User.exists({ phone }), Captain.exists({ phone })]);
  if (userCollision || captainCollision) throw httpError('رقم الجوال مستخدم في حساب آخر', 409);

  let merchant = await Merchant.findOne({ $or: [{ restaurant: restaurantId }, { restaurants: restaurantId }] }).select('+passwordHash');
  const phoneOwner = await Merchant.findOne({ phone });
  if (phoneOwner && (!merchant || String(phoneOwner._id) !== String(merchant._id))) {
    // إذا اختار الأدمن نفس مالك موجود، نربط المتجر الجديد به كفرع بدل رفض الرقم.
    if (payload.attachAsBranch === true) {
      phoneOwner.restaurants = [...new Set([...(phoneOwner.restaurants || []).map(String), String(restaurantId)])];
      if (!phoneOwner.activeRestaurant) phoneOwner.activeRestaurant = phoneOwner.restaurant;
      await phoneOwner.save();
      return publicMerchant(phoneOwner);
    }
    throw httpError('رقم الجوال مستخدم لحساب شريك آخر. فعّل خيار ربطه كفرع.', 409);
  }

  if (!merchant) {
    if (password.length < 6) throw httpError('كلمة السر ٦ أحرف على الأقل');
    merchant = new Merchant({
      name,
      phone,
      restaurant: restaurantId,
      restaurants: [],
      activeRestaurant: restaurantId,
      isActive: payload.isActive === undefined ? true : !!payload.isActive,
      organizationName: payload.organizationName || '',
    });
  } else {
    merchant.name = name;
    merchant.phone = phone;
    if (payload.isActive !== undefined) merchant.isActive = !!payload.isActive;
    if (payload.organizationName !== undefined) merchant.organizationName = String(payload.organizationName || '').trim();
  }
  if (password) {
    if (password.length < 6) throw httpError('كلمة السر ٦ أحرف على الأقل');
    await merchant.setPassword(password);
  }
  await merchant.save();
  return publicMerchant(merchant);
}

async function requireMerchant(merchantId, requestedRestaurantId = null) {
  const merchant = await Merchant.findById(merchantId).lean();
  if (!merchant || !merchant.isActive) throw httpError('حساب المتجر غير متاح', 403);
  const ids = merchantBranchIds(merchant);
  const restaurantId = requestedRestaurantId || merchant.activeRestaurant || merchant.restaurant;
  if (!restaurantId || !ids.includes(String(restaurantId))) {
    throw httpError('الفرع المحدد غير تابع لهذا الحساب', 403);
  }
  return { merchant, restaurantId: String(restaurantId) };
}

async function getProfile(merchantId, restaurantId = null) {
  const ctx = await requireMerchant(merchantId, restaurantId);
  const [restaurant, branches] = await Promise.all([
    Restaurant.findById(ctx.restaurantId).lean(),
    Restaurant.find({ _id: { $in: merchantBranchIds(ctx.merchant) } })
      .select('name imageUrl city neighborhood active isOpen')
      .sort({ createdAt: 1 })
      .lean(),
  ]);
  if (!restaurant || restaurant.active === false) throw httpError('الفرع غير متاح', 403);
  return publicMerchant(ctx.merchant, restaurant, branches);
}

async function updateRestaurant(merchantId, restaurantId, payload = {}) {
  const ctx = await requireMerchant(merchantId, restaurantId);
  const allowed = {};
  for (const key of ['description','phone','minOrder','prepMinutes','openTime','closeTime','isOpen','busyUntil','busyExtraPrepMinutes','weeklyHours','promotion']) {
    if (payload[key] !== undefined) allowed[key] = payload[key];
  }
  if (allowed.busyExtraPrepMinutes !== undefined) {
    allowed.busyExtraPrepMinutes = Math.min(180, Math.max(0, Number(allowed.busyExtraPrepMinutes) || 0));
  }
  if (allowed.busyUntil === '') allowed.busyUntil = null;
  const restaurant = await Restaurant.findByIdAndUpdate(ctx.restaurantId, { $set: allowed }, { new: true, runValidators: true });
  if (!restaurant) throw httpError('المتجر غير موجود', 404);
  return restaurant;
}

async function listMenu(merchantId, restaurantId = null) {
  const ctx = await requireMerchant(merchantId, restaurantId);
  return restaurantService.adminListMenu(ctx.restaurantId);
}

function advancedItemFields(payload = {}) {
  const out = {};
  if (payload.optionGroups !== undefined) out.optionGroups = Array.isArray(payload.optionGroups) ? payload.optionGroups.slice(0, 12) : [];
  if (payload.trackInventory !== undefined) out.trackInventory = !!payload.trackInventory;
  if (payload.inventoryQty !== undefined) out.inventoryQty = Math.max(0, Number(payload.inventoryQty) || 0);
  if (payload.lowStockThreshold !== undefined) out.lowStockThreshold = Math.max(0, Number(payload.lowStockThreshold) || 0);
  return out;
}

async function createMenuItem(merchantId, restaurantId, payload) {
  const ctx = await requireMerchant(merchantId, restaurantId);
  const item = await restaurantService.createMenuItem(ctx.restaurantId, payload);
  const advanced = advancedItemFields(payload);
  if (Object.keys(advanced).length) {
    return MenuItem.findByIdAndUpdate(item._id, { $set: advanced }, { new: true, runValidators: true });
  }
  return item;
}

async function ownedItem(merchantId, restaurantId, itemId) {
  const ctx = await requireMerchant(merchantId, restaurantId);
  const item = await MenuItem.findOne({ _id: itemId, restaurant: ctx.restaurantId });
  if (!item) throw httpError('الصنف غير موجود في الفرع الحالي', 404);
  return { item, ctx };
}

async function updateMenuItem(merchantId, restaurantId, itemId, payload) {
  await ownedItem(merchantId, restaurantId, itemId);
  await restaurantService.updateMenuItem(itemId, payload);
  const advanced = advancedItemFields(payload);
  if (Object.keys(advanced).length) {
    return MenuItem.findByIdAndUpdate(itemId, { $set: advanced }, { new: true, runValidators: true });
  }
  return MenuItem.findById(itemId);
}

async function adjustInventory(merchantId, restaurantId, itemId, delta) {
  const { item } = await ownedItem(merchantId, restaurantId, itemId);
  const next = Math.max(0, Number(item.inventoryQty || 0) + Number(delta || 0));
  item.inventoryQty = next;
  item.trackInventory = true;
  if (next === 0) item.available = false;
  if (next > 0 && item.available === false) item.available = true;
  await item.save();
  return item;
}

async function inventorySummary(merchantId, restaurantId = null) {
  const ctx = await requireMerchant(merchantId, restaurantId);
  const items = await MenuItem.find({ restaurant: ctx.restaurantId, trackInventory: true }).sort({ inventoryQty: 1 }).lean();
  return {
    tracked: items.length,
    outOfStock: items.filter((x) => Number(x.inventoryQty) <= 0).length,
    lowStock: items.filter((x) => Number(x.inventoryQty) > 0 && Number(x.inventoryQty) <= Number(x.lowStockThreshold || 0)).length,
    items,
  };
}

async function deleteMenuItem(merchantId, restaurantId, itemId) {
  await ownedItem(merchantId, restaurantId, itemId);
  return restaurantService.deleteMenuItem(itemId);
}

async function setRestaurantImage(merchantId, restaurantId, file) {
  const ctx = await requireMerchant(merchantId, restaurantId);
  return restaurantService.setRestaurantImage(ctx.restaurantId, file);
}
async function setMenuItemImage(merchantId, restaurantId, itemId, file) {
  await ownedItem(merchantId, restaurantId, itemId);
  return restaurantService.setMenuItemImage(itemId, file);
}

async function listOrders(merchantId, restaurantId, query = {}) {
  const ctx = await requireMerchant(merchantId, restaurantId);
  const filter = { 'store.restaurant': ctx.restaurantId, status: { $ne: ORDER_STATUS.CANCELLED } };
  if (query.status && query.status !== 'all') filter['store.merchantStatus'] = query.status;
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  return Order.find(filter).populate('user', 'name lastName phone').populate('captain', 'name phone').sort({ createdAt: -1 }).limit(limit).lean();
}

const MERCHANT_TRANSITIONS = { new: ['accepted'], accepted: ['preparing'], preparing: ['ready'], ready: [] };
async function updateOrderStatus(merchantId, restaurantId, orderId, nextStatus) {
  const ctx = await requireMerchant(merchantId, restaurantId);
  const order = await Order.findOne({ _id: orderId, 'store.restaurant': ctx.restaurantId });
  if (!order) throw httpError('الطلب غير موجود في الفرع الحالي', 404);
  if ([ORDER_STATUS.CANCELLED, ORDER_STATUS.DELIVERED].includes(order.status)) throw httpError('لا يمكن تعديل طلب منتهٍ');
  const current = order.store?.merchantStatus || 'new';
  if (!(MERCHANT_TRANSITIONS[current] || []).includes(nextStatus)) throw httpError(`انتقال غير مسموح: ${current} -> ${nextStatus}`);
  order.store.merchantStatus = nextStatus;
  order.store.merchantUpdatedAt = new Date();
  await order.save();
  await order.populate('user', 'name lastName phone');
  await order.populate('captain', 'name phone');
  const socket = io.get();
  socket.to(ROOMS.merchant(String(ctx.restaurantId))).emit(EVENTS.ORDER_STATUS_UPDATED, order);
  socket.to(ROOMS.admins()).emit(EVENTS.ORDER_STATUS_UPDATED, order);
  socket.to(ROOMS.user(String(order.user?._id || order.user))).emit(EVENTS.ORDER_STATUS_UPDATED, order);
  socket.to(ROOMS.order(String(order._id))).emit(EVENTS.ORDER_STATUS_UPDATED, order);
  if (order.captain) socket.to(ROOMS.captain(String(order.captain?._id || order.captain))).emit(EVENTS.ORDER_STATUS_UPDATED, order);
  return order;
}

module.exports = {
  getAdminMerchant, upsertAdminMerchant, getProfile, updateRestaurant,
  listMenu, createMenuItem, updateMenuItem, adjustInventory, inventorySummary, deleteMenuItem,
  setRestaurantImage, setMenuItemImage, listOrders, updateOrderStatus, requireMerchant, merchantBranchIds,
};
