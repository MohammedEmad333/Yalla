'use strict';
// Read-only, opt-in. Never send personal data or delivery verification codes.
const Captain = require('../models/Captain');
const Link = require('../models/TelegramCaptainLink');
const { sendOnce } = require('./telegramCaptainDelivery.service');
const { recordBestEffort } = require('./telegramCaptainMetrics.service');
const { sendTelegramMessage } = require('./telegramCaptainTelegramClient.service');

async function trackedDelivery(kind, event, deliver, sendDelivery, metrics = recordBestEffort) {
  try {
    const result = await sendDelivery(event, deliver);
    const outcome = result?.status === 'in-flight' ? 'in_flight' : result?.status;
    if (['sent', 'duplicate', 'in_flight'].includes(outcome)) await metrics(kind, outcome);
    return result;
  } catch (error) {
    await metrics(kind, error?.code === 'TELEGRAM_RATE_LIMITED' ? 'rate_limited' : 'failed');
    throw error;
  }
}
const enabled = (env = process.env) => env.TELEGRAM_CAPTAIN_NOTIFICATIONS_ENABLED === 'true';
// Explicit recipient allowlist for safe production pilot. '*' deliberately opts into all.
function allowedCaptain(captainId, env = process.env) {
  const raw = env.TELEGRAM_CAPTAIN_NOTIFICATIONS_CAPTAIN_IDS || '';
  if (raw.trim() === '*') return true;
  const id = String(captainId).toLowerCase();
  if (!/^[0-9a-f]{24}$/.test(id)) return false;
  return raw.split(',').some((entry) => entry.trim().toLowerCase() === id);
}

function assignmentText(orderId) {
  if (!/^[0-9a-f]{24}$/i.test(String(orderId))) throw new Error('Invalid order ID');
  return '📦 تم إسناد طلب جديد إليك في Yalla.\nرقم الطلب: ' + String(orderId) +
    '\nافتح تطبيق Yalla لمراجعة تفاصيل الطلب. لا يمكن قبول أو رفض الطلب من تلجرام.';
}
async function notifyAssignedOrder({ captainId, orderId }, {
  env = process.env,
  findLink = (id) => Link.findOne({ captainId: id }).lean(),
  isApproved = (id) => Captain.exists({ _id: id, isApproved: true }),
  findCurrentOrder = (id, owner) => Order.exists({ _id: id, captain: owner, status: { $in: ['assigned', 'accepted'] } }),
  sendDelivery = sendOnce,
  fetchImpl = fetch,
  metrics = recordBestEffort,
  sleep,
} = {}) {
  if (!enabled(env)) return { status: 'disabled' };
  if (!allowedCaptain(captainId, env)) return { status: 'not-allowlisted' };
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return { status: 'unconfigured' };
  const link = await findLink(captainId);
  if (!link || !/^\d{1,20}$/.test(String(link.telegramChatId)) ||
      String(link.telegramChatId) !== String(link.telegramUserId)) return { status: 'unlinked' };
  if (!await isApproved(captainId)) return { status: 'unapproved' };
  if (link.notificationPreferences?.assigned === false) return { status: 'muted' };
  if (!await findCurrentOrder(orderId, captainId)) return { status: 'stale-event' };
  return trackedDelivery('assigned', { captainId, orderId, kind: 'assigned', status: 'assigned' }, async () => {
    await sendTelegramMessage(token, {
      chat_id: link.telegramChatId, text: assignmentText(orderId),
    }, { fetchImpl, sleep, onRetry: () => metrics('assigned', 'retried') });
  }, sendDelivery, metrics);
}

const Order = require('../models/Order');
const STATUS_TEXT = Object.freeze({
  accepted: 'تم قبول الطلب',
  picked_up: 'الطلب قيد التوصيل',
  delivered: 'تم تسليم الطلب',
  cancelled: 'تم إلغاء الطلب',
});
function orderStatusText(orderId, status) {
  if (!/^[a-f0-9]{24}$/i.test(String(orderId)) || !Object.hasOwn(STATUS_TEXT, status)) {
    throw new Error('Invalid order status notification');
  }
  return '📦 ' + STATUS_TEXT[status] + ' في Yalla.\nرقم الطلب: ' +
    String(orderId).slice(-6) + '\nافتح تطبيق Yalla للتفاصيل.';
}

// Only the existing opt-in pilot sender may deliver these messages.
// Recheck live ownership/status to suppress stale notifications after reassignment.
async function notifyOrderStatus({ captainId, orderId, status }, {
  env = process.env,
  findLink = (id) => Link.findOne({ captainId: id }).lean(),
  isApproved = (id) => Captain.exists({ _id: id, isApproved: true }),
  findCurrentOrder = (id, capId, currentStatus) => Order.exists({
    _id: id, captain: capId, status: currentStatus,
  }),
  sendDelivery = sendOnce,
  fetchImpl = fetch,
  metrics = recordBestEffort,
  sleep,
} = {}) {
  if (!enabled(env)) return { status: 'disabled' };
  if (!allowedCaptain(captainId, env)) return { status: 'not-allowlisted' };
  if (!/^[a-f0-9]{24}$/i.test(String(captainId)) ||
      !/^[a-f0-9]{24}$/i.test(String(orderId)) ||
      !Object.hasOwn(STATUS_TEXT, status)) return { status: 'invalid-event' };
  if (!env.TELEGRAM_BOT_TOKEN) return { status: 'unconfigured' };
  const [link, approved, current] = await Promise.all([
    findLink(captainId), isApproved(captainId), findCurrentOrder(orderId, captainId, status),
  ]);
  if (!link || !/^\d{1,20}$/.test(String(link.telegramChatId)) ||
      String(link.telegramChatId) !== String(link.telegramUserId)) return { status: 'unlinked' };
  if (!approved) return { status: 'unapproved' };
  if (!current) return { status: 'stale-event' };
  if (link.notificationPreferences?.status === false) return { status: 'muted' };
  return trackedDelivery('status', { captainId, orderId, kind: 'status', status }, async () => {
    await sendTelegramMessage(env.TELEGRAM_BOT_TOKEN, {
      chat_id: String(link.telegramChatId), text: orderStatusText(orderId, status),
    }, { fetchImpl, sleep, onRetry: () => metrics('status', 'retried') });
  }, sendDelivery, metrics);
}

module.exports = { enabled, allowedCaptain, assignmentText, notifyAssignedOrder, notifyOrderStatus, orderStatusText };
