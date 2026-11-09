'use strict';

const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Log = require('../models/Log');
const orderService = require('./order.service');
const pricing = require('./pricing.service');
const { parseAdminOrder } = require('../utils/adminOrder');
const { ROLES } = require('../utils/constants');

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

// Fetch a fresh role and region scope rather than trusting stale JWT claims.
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

async function preview(input, actorId) {
  const { userId, payload } = parseAdminOrder(input);
  const customer = await checkActorAndCustomer(actorId, userId, payload);
  const quote = pricing.quote(payload.pickup.location.coordinates, payload.dropoff.location.coordinates);
  // Preview is read-only; never open/fund a wallet just because a form was viewed.
  const wallet = await Wallet.findOne({ user: userId }).select('balance reservedBalance').lean();
  const availableBalance = Math.max(0, Number(wallet?.balance || 0) - Number(wallet?.reservedBalance || 0));
  return {
    ...quote,
    availableBalance,
    sufficientBalance: availableBalance >= quote.price,
    customerName: [customer.name, customer.lastName].filter(Boolean).join(' '),
  };
}

async function create(input, actorId) {
  const { userId, payload, requestKey } = parseAdminOrder(input, true);
  await checkActorAndCustomer(actorId, userId, payload);

  // The standard service rechecks the available balance and reserves a wallet hold
  // atomically. Never create an unpaid/charge-free operational order.
  const order = await orderService.createOrder(userId, payload, requestKey);
  const reused = order.$locals?.yallaCreatedNow === false;

  if (!reused) {
    await Log.create({
      order: order._id,
      actorId,
      actorRole: 'admin',
      action: 'ORDER_CREATED_BY_ADMIN',
      meta: { userId: String(userId), paymentMode: 'customer_wallet' },
    });
  }
  return {
    id: String(order._id),
    status: order.status,
    price: order.price,
    distanceKm: order.distanceKm,
    reused,
  };
}

module.exports = { searchCustomers, preview, create };
