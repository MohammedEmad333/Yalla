'use strict';
// Read-only, opt-in. Never send personal data or delivery verification codes.
const Captain = require('../models/Captain');
const Link = require('../models/TelegramCaptainLink');
const enabled = (env = process.env) => env.TELEGRAM_CAPTAIN_NOTIFICATIONS_ENABLED === 'true';
function assignmentText(orderId) {
  if (!/^[0-9a-f]{24}$/i.test(String(orderId))) throw new Error('Invalid order ID');
  return '📦 تم إسناد طلب جديد إليك في Yalla.\nرقم الطلب: ' + String(orderId) +
    '\nافتح تطبيق Yalla لمراجعة تفاصيل الطلب. لا يمكن قبول أو رفض الطلب من تلجرام.';
}
async function notifyAssignedOrder({ captainId, orderId }, {
  env = process.env,
  findLink = (id) => Link.findOne({ captainId: id }).lean(),
  isApproved = (id) => Captain.exists({ _id: id, isApproved: true }),
  fetchImpl = fetch,
} = {}) {
  if (!enabled(env)) return { status: 'disabled' };
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return { status: 'unconfigured' };
  const link = await findLink(captainId);
  if (!link || !/^\d{1,20}$/.test(String(link.telegramChatId)) ||
      String(link.telegramChatId) !== String(link.telegramUserId)) return { status: 'unlinked' };
  if (!await isApproved(captainId)) return { status: 'unapproved' };
  const response = await fetchImpl('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      chat_id: link.telegramChatId,
      text: assignmentText(orderId),
      disable_web_page_preview: true,
      protect_content: true,
    }),
    signal: AbortSignal.timeout(4500),
  });
  if (!response.ok) throw new Error('Telegram notification HTTP ' + response.status);
  const result = await response.json();
  if (!result.ok) throw new Error('Telegram notification API error');
  return { status: 'sent' };
}
module.exports = { enabled, assignmentText, notifyAssignedOrder };
