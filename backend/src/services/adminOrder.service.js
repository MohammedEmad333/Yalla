'use strict';

const crypto = require('node:crypto');
const User = require('../models/User');
const Captain = require('../models/Captain');
const Order = require('../models/Order');
const Wallet = require('../models/Wallet');
const Log = require('../models/Log');
const orderService = require('./order.service');
const pricing = require('./pricing.service');
const { parseAdminOrder } = require('../utils/adminOrder');
const { ROLES } = require('../utils/constants');

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

// Check real admin permissions and region scope from Mongo instead of JWT claims.
async function checkActorAndCustomer(actorId, userId, { pickup, dropoff }) {
  const admin = await User.findOne({ _id: actorId, role: ROLES.ADMIN, isActive: true })
    .select('adminRole regions').lean();
  if (!admin || !['super_admin', 'operations'].includes(admin.adminRole)) {
    throw httpError('لا تملك صلاحية إنشاء الطلبات', 403);
  }
  if (admin.adminRole !== 'super_admin' && admin.regions?.length) {
    if (![pickup.city, dropoff.city].some((city) => admin.regions.includes(city))) {
      throw httpError('الطلب خارج المناطق المسموحة لحساب الإدارة', 403);
    }
  }
  const customer = await User.findOne({ _id: userId, role: ROLES.USER, isActive: true })
    .select('name lastName phone').lean();
  if (!customer) throw httpError('الزبون غير موجود أو حسابه معطّل', 404);
  return customer;
}

async function searchCustomers(query) {
  const q = String(query || '').trim();
  if (q.length < 2 || q.length > 60) throw httpError('أدخل حرفين على الأقل للبحث عن زبون');
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(safe, 'i');
  const users = await User.find({
    role: ROLES.USER,
    isActive: true,
    $or: [{ name: regex }, { lastName: regex }, { phone: regex }],
  }).select('name lastName phone').sort({ createdAt: -1 }).limit(20).lean();
  return users.map((user) => ({
    id: String(user._id),
    name: [user.name, user.lastName].filter(Boolean).join(' '),
    phone: user.phone,
  }));
}

async function listCaptains() {
  return orderService.getAssignableCaptains();
}

function quoteFor({ payload, priceMode, customPrice }) {
  const quote = pricing.quote(payload.pickup.location.coordinates, payload.dropoff.location.coordinates);
  return {
    ...quote,
    recommendedPrice: quote.price,
    price: priceMode === 'custom' ? customPrice : quote.price,
    freeDelivery: priceMode === 'custom' && customPrice === 0,
  };
}

async function validateCaptain(captainId) {
  if (!captainId) return null;
  const captain = await Captain.findById(captainId).select('isApproved');
  if (!captain || !captain.isApproved) throw httpError('الكابتن غير موجود أو غير معتمَد', 400);
  return captain;
}

async function preview(input, actorId) {
  const parsed = parseAdminOrder(input);
  const { userId } = parsed;
  const customer = await checkActorAndCustomer(actorId, userId, parsed.payload);
  await validateCaptain(parsed.captainId);
  const quote = quoteFor(parsed);
  const wallet = await Wallet.findOne({ user: userId }).select('balance reservedBalance').lean();
  const availableBalance = Math.max(0, Number(wallet?.balance || 0) - Number(wallet?.reservedBalance || 0));
  return {
    ...quote,
    availableBalance,
    sufficientBalance: availableBalance >= quote.price,
    customerName: [customer.name, customer.lastName].filter(Boolean).join(' '),
  };
}

function requestFingerprint(parsed) {
  return crypto.createHash('sha256').update(JSON.stringify({
    userId: parsed.userId,
    pickup: parsed.payload.pickup,
    dropoff: parsed.payload.dropoff,
    packageNote: parsed.payload.packageNote,
    priceMode: parsed.priceMode,
    customPrice: parsed.customPrice ?? null,
    priceReason: parsed.priceReason,
    captainId: parsed.captainId,
  })).digest('hex');
}

async function create(input, actorId) {
  const parsed = parseAdminOrder(input, true);
  const { userId, payload, requestKey, captainId } = parsed;
  await checkActorAndCustomer(actorId, userId, payload);

  const hash = requestFingerprint(parsed);
  // Do not charge twice or apply a different price/captain to an old request key.
  const prior = await Order.findOne({ user: userId, idempotencyKey: requestKey }).select('+adminRequestHash');
  if (prior && prior.adminRequestHash !== hash) {
    throw httpError('مفتاح الطلب مستخدم لطلب مختلف؛ ابدأ طلبًا جديدًا', 409);
  }
  if (!prior) await validateCaptain(captainId);

  // The normal creation service owns reservations, notifications, dispatch, and
  // duplicate-key handling. Disable automatic dispatch only for captain selection.
  const order = await orderService.createOrder(userId, payload, requestKey, {
    ...(parsed.priceMode === 'custom' ? { adminPrice: parsed.customPrice } : {}),
    adminRequestHash: hash,
    skipAutoDispatch: !!captainId,
  });
  const reused = order.$locals?.yallaCreatedNow === false;
  if (reused && order.adminRequestHash !== hash) {
    throw httpError('مفتاح الطلب مستخدم لطلب مختلف؛ ابدأ طلبًا جديدًا', 409);
  }

  if (!reused) {
    await Log.create({
      order: order._id,
      actorId,
      actorRole: 'admin',
      action: 'ORDER_CREATED_BY_ADMIN',
      meta: {
        userId: String(userId),
        paymentMode: parsed.priceMode === 'custom' && parsed.customPrice === 0
          ? 'admin_free' : 'customer_wallet',
        customPrice: parsed.priceMode === 'custom' ? parsed.customPrice : null,
        priceReason: parsed.priceReason,
        requestedCaptainId: captainId || null,
      },
    });
  }

  // If this fails, the already-created order is still valid and paid/held.
  // Tell the operator what remains to do instead of returning an ambiguous 500
  // that might cause an accidental duplicate order.
  let assignmentError = null;
  if (captainId && String(order.captain?._id || order.captain || '') !== captainId) {
    if (order.status === 'pending') {
      try {
        await orderService.assignOrder(actorId, order._id, captainId);
      } catch (err) {
        assignmentError = err.message || 'تعذّر إسناد الكابتن، الطلب محفوظ بانتظار الإسناد';
      }
    } else {
      assignmentError = 'تم إنشاء الطلب، لكن حالته تغيرت قبل الإسناد اليدوي';
    }
  }

  const latest = await Order.findById(order._id).select('status captain price distanceKm');
  return {
    id: String(order._id),
    status: latest?.status || order.status,
    price: latest?.price ?? order.price,
    distanceKm: latest?.distanceKm ?? order.distanceKm,
    captainId: latest?.captain ? String(latest.captain) : null,
    assignmentError,
    reused,
  };
}

module.exports = { searchCustomers, listCaptains, preview, create };
