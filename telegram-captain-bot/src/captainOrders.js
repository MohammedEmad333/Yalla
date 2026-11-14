'use strict';
const STATUS = Object.freeze({ assigned: 'تم إسناده', accepted: 'تم قبوله', picked_up: 'قيد التوصيل', delivered: 'تم التسليم', cancelled: 'أُلغي' });
function clean(value, max = 80) { return String(value || '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, max).trim(); }
function formatOrder(order) {
  const status = STATUS[order.status] || 'غير معروفة';
  const store = clean(order.storeName);
  return '#' + clean(order.reference, 6) + ' — ' + status + (store ? '\nالمتجر: ' + store : '');
}
function orderButtons(order) {
  if (!/^[a-f0-9]{24}$/i.test(order.orderId || '')) return undefined;
  return { inline_keyboard: [[{ text: '🔄 تحديث الحالة', callback_data: 'status:' + order.orderId }]] };
}
function backendUrl(path) {
  const base = process.env.YALLA_BACKEND_URL;
  if (!base) throw new Error('Telegram bridge URL is missing');
  const url = new URL(path, base);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Telegram bridge requires HTTPS');
  return url;
}
async function requestBackend(path, body, fetchImpl = fetch) {
  const secret = process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
  if (!secret || secret.length < 32) throw new Error('Telegram bridge secret missing');
  const response = await fetchImpl(backendUrl(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-telegram-pairing-secret': secret },
    body: JSON.stringify(body), signal: AbortSignal.timeout(4500),
  });
  if (!response.ok) throw new Error('Telegram bridge HTTP ' + response.status);
  return response.json();
}
async function handleReadOnlyCommand(update, send, request = requestBackend) {
  const message = update?.message, callback = update?.callback_query;
  const chat = message?.chat || callback?.message?.chat, sender = callback?.from || message?.from;
  if (chat?.type !== 'private' || !sender?.id || String(sender.id) !== String(chat.id)) return false;
  const input = String(message?.text || '').trim();

  if (/^\/(?:orders|myorders)(?:@\w+)?$/i.test(input)) {
    const result = await request('/api/telegram-captain/internal/orders', {
      telegramUserId: String(sender.id), telegramChatId: String(chat.id),
    });
    const payload = !result?.linked
      ? { text: 'حسابك غير مرتبط أو غير معتمد. اربطه من إعدادات الكابتن في تطبيق Yalla.' }
      : !Array.isArray(result.orders) || !result.orders.length
        ? { text: 'لا توجد لديك طلبات نشطة حاليًا.' }
        : {
          text: '🛵 طلباتك النشطة (آخر 5):\n\n' + result.orders.map(formatOrder).join('\n\n'),
          reply_markup: { inline_keyboard: result.orders
            .filter(o => /^[a-f0-9]{24}$/i.test(o.orderId || ''))
            .map(o => [{ text: '🔄 #' + clean(o.reference, 6), callback_data: 'status:' + o.orderId }]) },
        };
    await send('sendMessage', { chat_id: chat.id, ...payload });
    return true;
  }
  // A full MongoDB order ID is required. Never resolve short references across accounts.
  // The backend independently verifies the private Telegram identity and order owner.
  const lookup = /^\/order(?:@\w+)?(?:\s+(.+))?$/i.exec(input);
  if (lookup) {
    const id = String(lookup[1] || '').trim();
    if (!/^[a-f0-9]{24}$/i.test(id)) {
      await send('sendMessage', {
        chat_id: chat.id,
        text: 'استخدم /order مع رقم الطلب الكامل (24 حرفًا)، أو /orders لعرض الطلبات النشطة.',
      });
      return true;
    }
    const result = await request('/api/telegram-captain/internal/order', {
      telegramUserId: String(sender.id), telegramChatId: String(chat.id), orderId: id,
    });
    const messageText = !result?.linked
      ? 'حسابك غير مرتبط أو غير معتمد. اربطه من تطبيق Yalla.'
      : !result.order
        ? 'الطلب غير متاح لهذا الحساب.'
        : '🛵 حالة الطلب الآن:\n' + formatOrder(result.order);
    await send('sendMessage', {
      chat_id: chat.id, text: messageText,
      ...(result?.linked && result.order ? { reply_markup: orderButtons(result.order) } : {}),
    });
    return true;
  }
  if (callback?.data?.startsWith('status:')) {
    if (!/^status:[a-f0-9]{24}$/i.test(callback.data)) {
      await send('answerCallbackQuery', { callback_query_id: callback.id, text: 'طلب غير صالح' });
      return true;
    }
    const result = await request('/api/telegram-captain/internal/order', {
      telegramUserId: String(sender.id), telegramChatId: String(chat.id),
      orderId: callback.data.slice(7),
    });
    const payload = !result?.linked ? 'حسابك غير مرتبط. اربطه من التطبيق.'
      : result.order ? '🛵 حالة الطلب الآن:\n' + formatOrder(result.order)
        : 'الطلب غير متاح لهذا الحساب.';
    await send('answerCallbackQuery', { callback_query_id: callback.id });
    await send('sendMessage', { chat_id: chat.id, text: payload,
      ...(result.order ? { reply_markup: orderButtons(result.order) } : {}) });
    return true;
  }
  return false;
}
async function deliverEvent(event, send, request = requestBackend) {
  const result = await request('/api/telegram-captain/internal/resolve-event', {
    eventType: event.eventType, orderId: event.orderId, captainId: event.captainId, status: event.status,
  });
  if (!result?.deliver) return { skipped: true };
  const chatId = String(result.telegramChatId || '');
  if (!/^[0-9]{1,20}$/.test(chatId)) throw new Error('Invalid resolved Telegram chat');
  await send('sendMessage', {
    chat_id: chatId, text: (event.eventType === 'assigned' ? '🛵 طلب جديد أُسند إليك' : '📦 تحديث حالة طلبك') +
      '\n' + formatOrder(result.order) + '\n\nاستخدم /orders لمراجعة طلباتك.',
    reply_markup: orderButtons(result.order),
  });
  return { delivered: true };
}
module.exports = { handleReadOnlyCommand, deliverEvent, requestBackend, formatOrder, orderButtons };
