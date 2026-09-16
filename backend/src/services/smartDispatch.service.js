'use strict';

const Order = require('../models/Order');
const Captain = require('../models/Captain');
const orderService = require('./order.service');
const { etaBreakdown } = require('../utils/eta');
const { ORDER_STATUS } = require('../utils/constants');

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

async function loadPending(orderId) {
  const order = await Order.findById(orderId).lean();
  if (!order) throw httpError('الطلب غير موجود', 404);
  if (order.status !== ORDER_STATUS.PENDING) throw httpError('الطلب لم يعد بانتظار الإسناد', 400);
  return order;
}

async function recommendations(orderId) {
  const order = await loadPending(orderId);
  const coords = order.pickup?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length !== 2) throw httpError('موقع الاستلام غير صالح');
  const rows = await Captain.smartDispatchCandidates(coords, {
    maxKm: 15,
    excludeIds: order.rejectedBy || [],
    limit: 15,
  });
  return {
    order: {
      id: order._id,
      pickup: order.pickup,
      dropoff: order.dropoff,
      distanceKm: order.distanceKm,
      etaMinutes: order.etaMinutes,
      createdAt: order.createdAt,
    },
    candidates: rows.slice(0, 10).map((row, index) => ({
      id: row._id,
      rank: index + 1,
      name: row.name,
      phone: row.phone,
      vehicleType: row.vehicleType,
      status: row.status,
      rating: row.rating,
      activeOrdersCount: row.activeOrdersCount || 0,
      distanceKm: row.distanceKm,
      locationAgeMinutes: row.locationAgeMinutes,
      score: row.dispatchScore,
      eta: etaBreakdown(order.distanceKm || 0, row.vehicleType),
    })),
  };
}

async function assignBest(adminId, orderId) {
  const result = await recommendations(orderId);
  if (!result.candidates.length) throw httpError('لا يوجد كابتن مناسب حاليًا', 404);
  const best = result.candidates[0];
  const order = await orderService.assignOrder(adminId, orderId, best.id);
  return { assigned: true, candidate: best, order };
}

async function pendingOrders() {
  const rows = await Order.find({ status: ORDER_STATUS.PENDING })
    .populate('user', 'name lastName phone')
    .sort({ createdAt: 1 })
    .limit(100)
    .lean();
  return rows.map((order) => ({
    id: order._id,
    user: order.user,
    pickup: order.pickup,
    dropoff: order.dropoff,
    distanceKm: order.distanceKm,
    etaMinutes: order.etaMinutes,
    scheduledAt: order.scheduledAt,
    store: order.store ? { name: order.store.name, restaurant: order.store.restaurant } : null,
    rejectedCount: Array.isArray(order.rejectedBy) ? order.rejectedBy.length : 0,
    createdAt: order.createdAt,
  }));
}

module.exports = { recommendations, assignBest, pendingOrders };
