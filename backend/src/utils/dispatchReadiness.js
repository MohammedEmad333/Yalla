'use strict';

const { ORDER_STATUS } = require('./constants');
const { isDue } = require('./schedule');
const READY_STORE_STATUSES = new Set(['accepted', 'preparing', 'ready', 'handed_over']);

// Pure eligibility check for admin dispatch previews. Assignment still validates
// eligibility again at the write boundary to prevent stale previews from racing.
function isDispatchReady(order, now = new Date()) {
  if (!order || order.status !== ORDER_STATUS.PENDING) return false;
  if (order.scheduledAt && !order.scheduledActivated && !isDue(order.scheduledAt, now)) return false;
  if (order.store?.restaurant && !READY_STORE_STATUSES.has(order.store.merchantStatus)) return false;
  return true;
}

// Match the same eligibility rules inside MongoDB before sorting/limiting.
// A post-limit JS filter could hide ready orders behind 100 future orders.
function dispatchReadyQuery(now = new Date()) {
  return {
    status: ORDER_STATUS.PENDING,
    $and: [
      { $or: [
        { scheduledAt: null },
        { scheduledActivated: true },
        { scheduledAt: { $lte: now } },
      ] },
      { $or: [
        { 'store.restaurant': null },
        { 'store.merchantStatus': { $in: [...READY_STORE_STATUSES] } },
      ] },
    ],
  };
}

module.exports = { isDispatchReady, dispatchReadyQuery };
