'use strict';
function createTelegramClient(token, fetchImpl = fetch) {
  return async function send(method, payload) {
    const response = await fetchImpl('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(8000),
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
    signal: AbortSignal.timeout(8000),
  });
  return response.status === 200;
}
async function handleUpdate(update, send) {
  const message = update?.message;
  const callback = update?.callback_query;
  const chat = message?.chat || callback?.message?.chat;
  if (!chat || chat.type !== 'private') return;
  if (callback) {
    await send('answerCallbackQuery', { callback_query_id: callback.id, text: 'الخدمة قيد التجهيز' });
    return;
  }
  if (!message?.text || message.from?.is_bot) return;
  const input = message.text.trim();
  const match = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{32})$/.exec(input);
  if (match) {
    let linked = false;
    try { linked = await redeemPairing(match[1], message.from.id, chat.id); }
    catch (err) { console.error('Pairing bridge error:', err.message); }
    await send('sendMessage', { chat_id: chat.id, text: linked ? 'تم ربط حساب الكابتن بنجاح.' : 'تعذر ربط الحساب. تحقق من الرمز أو اطلب رمزًا جديدًا من التطبيق.' });
    return;
  }
  await send('sendMessage', {
    chat_id: chat.id,
    text: 'Yalla Delivery — بوت الكباتن\n\nسيتم تفعيل ربط الحساب الآمن قريبًا. لا ترسل كلمة المرور أو رمز التحقق هنا. استخدم تطبيق Yalla حاليًا لإدارة الطلبات.',
    disable_web_page_preview: true,
  });
}
module.exports = { createTelegramClient, handleUpdate, redeemPairing };
).exec(input);
  if (match) {
    let linked = false;
    try { linked = await redeemPairing(match[1], message.from.id, chat.id); }
    catch (err) { console.error('Pairing bridge error:', err.message); }
    await send('sendMessage', { chat_id: chat.id, text: linked ? 'تم ربط حساب الكابتن بنجاح.' : 'تعذر ربط الحساب. تحقق من الرمز أو اطلب رمزًا جديدًا من التطبيق.' });
    return;
  }
  await send('sendMessage', {
    chat_id: chat.id,
    text: 'Yalla Delivery — بوت الكباتن\n\nسيتم تفعيل ربط الحساب الآمن قريبًا. لا ترسل كلمة المرور أو رمز التحقق هنا. استخدم تطبيق Yalla حاليًا لإدارة الطلبات.',
    disable_web_page_preview: true,
  });
}
module.exports = { createTelegramClient, handleUpdate, redeemPairing };
