'use strict';
const logger = require('../utils/logger');
const { ORDER_STATUS } = require('../utils/constants');

// This is opt-in. Production API and systemd bot currently share the host
// network, so the bot's private 8098 listener is reachable over loopback.
const INTERNAL_URL = 'http://127.0.0.1:8098/internal/order-event';
const STATUS_TIMESTAMPS = {
  [ORDER_STATUS.ASSIGNED]: 'assignedAt',
  [ORDER_STATUS.ACCEPTED]: 'acceptedAt',
  [ORDER_STATUS.PICKED_UP]: 'pickedUpAt',
  [ORDER_STATUS.DELIVERED]: 'deliveredAt',
  [ORDER_STATUS.CANCELLED]: 'cancelledAt',
};
function enabled() { return process.env.TELEGRAM_CAPTAIN_NOTIFICATIONS_ENABLED === 'true'; }

async function sendOrderEvent(order, eventType, fetchImpl = fetch) {
  if (!enabled()) return { skipped: true, reason: 'disabled' };
  const secret = process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
  if (!secret || secret.length < 32) throw new Error('Telegram notification bridge is not configured');
  if (!order?.captain || !order?._id || !['assigned', 'status'].includes(eventType)) {
    return { skipped: true, reason: 'missing-order' };
  }
  const orderId = String(order._id);
  const captainId = String(order.captain._id || order.captain);
  if (!/^[a-f0-9]{24}$/i.test(orderId) || !/^[a-f0-9]{24}$/i.test(captainId)) {
    return { skipped: true, reason: 'invalid-id' };
  }
  const status = order.status;
  if (eventType === 'assigned' && ![ORDER_STATUS.ASSIGNED, ORDER_STATUS.ACCEPTED].includes(status)) {
    return { skipped: true, reason: 'not-assigned' };
  }
  const timestampKey = eventType === 'assigned' ? 'assignedAt' : STATUS_TIMESTAMPS[status];
  const eventDate = order.timeline?.[timestampKey];
  const eventTime = eventDate ? new Date(eventDate).getTime() : NaN;
  if (!Number.isSafeInteger(eventTime) || eventTime <= 0) {
    return { skipped: true, reason: 'missing-event-time' };
  }
  const eventId = [orderId, eventType, status, eventTime].join(':');
  const response = await fetchImpl(INTERNAL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-telegram-pairing-secret': secret,
    },
    body: JSON.stringify({ eventId, eventType, orderId, captainId, status }),
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error('Telegram notification HTTP ' + response.status);
  return { sent: true };
}

function notifyOrderEvent(order, eventType) {
  // Notification failures must never block acceptance, settlement or dispatch.
  if (!enabled()) return;
  sendOrderEvent(order, eventType).catch((error) =>
    logger.warn('Telegram captain notification unavailable:', error.message)
  );
}

module.exports = { enabled, sendOrderEvent, notifyOrderEvent };
