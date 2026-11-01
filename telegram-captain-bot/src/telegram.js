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
  await send('sendMessage', {
    chat_id: chat.id,
    text: 'Yalla Delivery — بوت الكباتن\n\nسيتم تفعيل ربط الحساب الآمن قريبًا. لا ترسل كلمة المرور أو رمز التحقق هنا. استخدم تطبيق Yalla حاليًا لإدارة الطلبات.',
    disable_web_page_preview: true,
  });
}
module.exports = { createTelegramClient, handleUpdate };
