'use strict';

// Only the private Telegram bot may call these methods via the authenticated
// internal routes. No phone numbers, locations, OTPs or wallet data are returned.
const Order = require('../models/Order');
const Captain = require('../models/Captain');
const Link = require('../models/TelegramCaptainLink');
const { ORDER_STATUS } = require('../utils/constants');

const ACTIVE = [
  ORDER_STATUS.ASSIGNED, ORDER_STATUS.ACCEPTED, ORDER_STATUS.PICKED_UP,
];
const ALLOWED_STATUS = [
  ...ACTIVE, ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED,
];
function validMongoId(value) { return typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value); }
function validTelegramId(value) { return /^[0-9]{1,20}$/.test(String(value || '')); }

function safeSummary(order) {
  const id = String(order._id);
  // Intentionally omit addresses, customer identifiers, codes, financial data.
  return {
    orderId: id,
    reference: id.slice(-6),
    status: order.status,
    storeName: String(order.store?.name || '').slice(0, 80),
  };
}

async function linkedCaptain(telegramUserId, telegramChatId) {
  if (!validTelegramId(telegramUserId) || !validTelegramId(telegramChatId) ||
      String(telegramUserId) !== String(telegramChatId)) return null;
  const link = await Link.findOne({
    telegramUserId: String(telegramUserId),
    telegramChatId: String(telegramChatId),
  }).select('captainId').lean();
  if (!link || !await Captain.exists({ _id: link.captainId, isApproved: true })) return null;
  return link.captainId;
}

async function listOrdersForTelegram({ telegramUserId, telegramChatId } = {}) {
  const captainId = await linkedCaptain(telegramUserId, telegramChatId);
  if (!captainId) return { linked: false, orders: [] };
  const orders = await Order.find({ captain: captainId, status: { $in: ACTIVE } })
    .select('_id status store.name')
    .sort({ createdAt: -1 })
    .limit(5)
    .lean();
  return { linked: true, orders: orders.map(safeSummary) };
}

async function getOrderForTelegram({ telegramUserId, telegramChatId, orderId } = {}) {
  const captainId = await linkedCaptain(telegramUserId, telegramChatId);
  if (!captainId) return { linked: false, order: null };
  if (!validMongoId(orderId)) return { linked: true, order: null };
  const order = await Order.findOne({ _id: orderId, captain: captainId })
    .select('_id status store.name')
    .lean();
  return { linked: true, order: order ? safeSummary(order) : null };
}

async function resolveOrderEvent({ orderId, captainId, status, eventType } = {}) {
  if (!validMongoId(orderId) || !validMongoId(captainId) ||
      !ALLOWED_STATUS.includes(status) ||
      !['assigned', 'status'].includes(eventType)) return { deliver: false };
  if (eventType === 'assigned' && ![ORDER_STATUS.ASSIGNED, ORDER_STATUS.ACCEPTED].includes(status)) {
    return { deliver: false };
  }
  // The assignment might already have been revoked, transferred, or updated.
  // Always revalidate current order ownership and exact status before delivery.
  const [captain, link, order] = await Promise.all([
    Captain.exists({ _id: captainId, isApproved: true }),
    Link.findOne({ captainId }).select('telegramChatId telegramUserId').lean(),
    Order.findOne({ _id: orderId, captain: captainId, status })
      .select('_id status store.name').lean(),
  ]);
  if (!captain || !link || !order ||
      !validTelegramId(link.telegramChatId) ||
      String(link.telegramChatId) !== String(link.telegramUserId)) {
    return { deliver: false };
  }
  return {
    deliver: true,
    telegramChatId: String(link.telegramChatId),
    order: safeSummary(order),
  };
}

module.exports = {
  safeSummary, linkedCaptain, listOrdersForTelegram, getOrderForTelegram,
  resolveOrderEvent,
};
