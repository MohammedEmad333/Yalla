'use strict';
const { handleReadOnlyCommand } = require('./captainOrders');

// Telegram will never deliver to a user who blocked the bot, and an expired
// callback cannot be answered. Retrying these updates forever is harmful.
// All other errors still reject so the webhook can retry transient failures.
function isPermanentTelegramError(method, status, description) {
  const detail = String(description || '').toLowerCase();
  if (status === 403 && method === 'sendMessage') {
    return /bot was blocked by the user|user is deactivated|bot can't initiate conversation|bot was kicked from the group chat/.test(detail);
  }
  if (status === 400 && method === 'answerCallbackQuery') {
    return /query is too old|query id is invalid|query_id_invalid/.test(detail);
  }
  return false;
}
function createTelegramClient(token, fetchImpl = fetch) {
  return async function send(method, payload) {
    const response = await fetchImpl('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(4500),
    });
    // Body is inspected only to distinguish permanent delivery failures.
    // Never include Telegram's response body or bot token in thrown errors.
    let result;
    try {
      result = await response.json();
    } catch {
      if (!response.ok) throw new Error('Telegram HTTP ' + response.status);
      throw new Error('Telegram API invalid response');
    }
    if (!response.ok || !result?.ok) {
      const status = Number(result?.error_code) || response.status;
      if (isPermanentTelegramError(method, status, result?.description)) return null;
      throw new Error(response.ok ? 'Telegram API error' : 'Telegram HTTP ' + response.status);
    }
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
      // Reuse the same callback to retain message ID and acknowledge once.
      await handleReadOnlyCommand({
        callback_query: { ...callback, data: 'orders:refresh' },
      }, send);
      return;
    }
    if (action === 'help' || action === 'privacy') {
      await send('answerCallbackQuery', { callback_query_id: callback.id });
      const payload = {
        chat_id: chat.id,
        text: action === 'privacy' ? PRIVACY_TEXT : HELP_TEXT,
        reply_markup: helpKeyboard(),
      };
      if (Number.isSafeInteger(callback.message?.message_id) && callback.message.message_id > 0) {
        await send('editMessageText', { ...payload, message_id: callback.message.message_id });
      } else {
        await send('sendMessage', payload);
      }
      return;
    }
    await send('answerCallbackQuery', { callback_query_id: callback.id, text: 'خيار غير متاح' });
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
