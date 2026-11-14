'use strict';
const { handleReadOnlyCommand } = require('./captainOrders');
function createTelegramClient(token, fetchImpl = fetch) {
  return async function send(method, payload) {
    const response = await fetchImpl('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(4500),
    });
    if (!response.ok) throw new Error('Telegram HTTP ' + response.status);
    const result = await response.json();
    if (!result.ok) throw new Error('Telegram API error');
    return result.result;
  };
}
async function redeemPairing(code, userId, chatId, fetchImpl = fetch) {
  const base = process.env.YALLA_BACKEND_URL;
  const secret = process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
  if (!base || !secret || secret.length < 32) throw new Error('Telegram pairing bridge is not configured');
  const url = new URL('/api/telegram-captain/internal/redeem', base);
  if (url.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
    throw new Error('Telegram pairing bridge requires HTTPS');
  }
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-pairing-secret': secret },
    body: JSON.stringify({ code, telegramUserId: String(userId), telegramChatId: String(chatId) }),
    signal: AbortSignal.timeout(4500),
  });
  if (response.status === 200) return true;
  if (response.status === 400 || response.status === 409) return false;
  if (response.status === 403) {
    const body = await response.json().catch(() => ({}));
    if (body?.message === 'Captain account is not approved') return false;
    throw new Error('Pairing bridge authorization failed');
  }
  // 429, 5xx, 404 and unexpected statuses are infrastructure/config errors.
  // Do not acknowledge the webhook before Telegram can retry.
  throw new Error('Pairing bridge HTTP ' + response.status);
}

const HELP_TEXT = [
  '🛵 Yalla | مساعد الكابتن',
  '',
  '📋 /orders أو /myorders: آخر 5 طلبات نشطة.',
  '🔎 /order رقم_الطلب: استعلام عن طلب محدد من حسابك فقط (24 حرفًا).',
  '🔄 استخدم زر تحديث الحالة لمعرفة حالة الطلب الحالية.',
  '🔗 لربط الحساب: أنشئ رمز الربط من تطبيق Yalla ثم أرسله مع /start.',
  '❓ /help: قائمة الأوامر.',
  '🔒 /privacy: سياسة الخصوصية.',
  '',
  'قبول الطلب أو تسليمه أو إلغاؤه يتم فقط داخل تطبيق Yalla.',
].join('\n');
const PRIVACY_TEXT = [
  '🔒 الخصوصية في بوت Yalla',
  '',
  'نعرض للكابتن المرتبط والمعتمد مرجع الطلب وحالته المختصرة واسم المتجر عند توفره.',
  'لا نعرض أسماء العملاء أو أرقامهم أو عناوينهم أو رموز التحقق أو بيانات المحفظة.',
  'لا ترسل كلمة مرور أو رمز تحقق هنا. إلغاء الربط يتم من تطبيق Yalla.',
].join('\n');
function helpKeyboard() {
  return { inline_keyboard: [
    [{ text: '📋 طلباتي النشطة', callback_data: 'menu:orders' }],
    [{ text: '🔒 الخصوصية', callback_data: 'menu:privacy' }],
    [{ text: '❓ المساعدة', callback_data: 'menu:help' }],
  ] };
}

async function handleUpdate(update, send) {
  const message = update?.message;
  const callback = update?.callback_query;
  const chat = message?.chat || callback?.message?.chat;
  if (!chat || chat.type !== 'private') return;
  if (callback && (!callback.from?.id || String(callback.from.id) !== String(chat.id))) return;
  if (callback?.data?.startsWith('menu:')) {
    const action = callback.data.slice(5);
    if (action === 'orders') {
      await handleReadOnlyCommand({
        message: { chat, from: callback.from, text: '/orders' },
      }, send);
    } else if (action === 'help' || action === 'privacy') {
      await send('sendMessage', {
        chat_id: chat.id, text: action === 'privacy' ? PRIVACY_TEXT : HELP_TEXT,
        reply_markup: helpKeyboard(),
      });
    }
    await send('answerCallbackQuery', {
      callback_query_id: callback.id,
      ...(!['orders', 'help', 'privacy'].includes(action) ? { text: 'خيار غير متاح' } : {}),
    });
    return;
  }
  if (await handleReadOnlyCommand(update, send)) return;
  if (callback) {
    await send('answerCallbackQuery', { callback_query_id: callback.id, text: 'استخدم /orders لعرض طلباتك' });
    return;
  }
  if (!message?.text || message.from?.is_bot || !message.from?.id) return;
  if (String(message.from.id) !== String(chat.id)) return;
  const input = message.text.trim();
  const command = /^\/(help|commands|privacy|start)(?:@\w+)?$/i.exec(input);
  if (command) {
    await send('sendMessage', {
      chat_id: chat.id,
      text: command[1].toLowerCase() === 'privacy' ? PRIVACY_TEXT : HELP_TEXT,
      reply_markup: helpKeyboard(), disable_web_page_preview: true,
    });
    return;
  }
  const match = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{32})$/.exec(input);
  if (match) {
    const linked = await redeemPairing(match[1], message.from.id, chat.id);
    await send('sendMessage', { chat_id: chat.id, text: linked ? 'تم ربط حساب الكابتن بنجاح.' : 'تعذر ربط الحساب. تحقق من الرمز أو اطلب رمزًا جديدًا من التطبيق.' });
    return;
  }
  await send('sendMessage', {
    chat_id: chat.id,
    text: 'Yalla Delivery — بوت الكباتن\n\nلإكمال ربط الحساب، استخدم تطبيق Yalla، ثم اكتب /orders لعرض طلباتك النشطة وتحديث حالتها. لا ترسل كلمة المرور أو رمز التحقق هنا. إدارة الطلبات تتم من تطبيق Yalla.',
    disable_web_page_preview: true,
  });
}
module.exports = { createTelegramClient, handleUpdate, redeemPairing, HELP_TEXT, PRIVACY_TEXT, helpKeyboard };
