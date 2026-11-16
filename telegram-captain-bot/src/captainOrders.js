'use strict';
const { t, normalizeLanguage } = require('./i18n');
const ACTIVE_FILTERS = Object.freeze(['assigned', 'accepted', 'picked_up']);
function clean(value, max = 80) { return String(value || '').replace(/[\x00-\x1f\x7f]/g, ' ').slice(0, max).trim(); }
function formatOrder(order, language = 'ar') {
  const status = t(language, 'status.' + (['assigned', 'accepted', 'picked_up', 'delivered', 'cancelled'].includes(order.status) ? order.status : 'unknown'));
  const store = clean(order.storeName);
  return '#' + clean(order.reference, 6) + ' — ' + status + (store ? '\n' + t(language, 'messages.store') + store : '');
}
function orderButtons(order, language = 'ar') {
  if (!/^[a-f0-9]{24}$/i.test(order.orderId || '')) return undefined;
  return { inline_keyboard: [
    [{ text: t(language, 'buttons.refreshStatus'), callback_data: 'status:' + order.orderId }],
    [{ text: t(language, 'buttons.allOrders'), callback_data: 'orders:refresh' }],
  ] };
}
// Inline navigation edits the current bot message instead of filling the chat
// with duplicate order lists. Message-only commands still create a new message.
function sendReadOnlyView(send, chatId, payload, callback) {
  const messageId = callback?.message?.message_id;
  if (!Number.isSafeInteger(messageId) || messageId <= 0) {
    return send('sendMessage', { chat_id: chatId, ...payload });
  }
  // Clearing stale buttons matters when a captain was unlinked or reassigned.
  const edited = payload.reply_markup ? payload
    : { ...payload, reply_markup: { inline_keyboard: [] } };
  return send('editMessageText', { chat_id: chatId, message_id: messageId, ...edited });
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
async function handleReadOnlyCommand(update, send, request = requestBackend, language = 'ar') {
  language = normalizeLanguage(language);
  const message = update?.message, callback = update?.callback_query;
  const chat = message?.chat || callback?.message?.chat, sender = callback?.from || message?.from;
  if (chat?.type !== 'private' || !sender?.id || String(sender.id) !== String(chat.id)) return false;
  const input = String(message?.text || '').trim();

  // Account status uses the existing authenticated captain orders endpoint.
  // Its response is reduced to a boolean; do not reveal orders on this view.
  if (/^\/account(?:@\w+)?$/i.test(input) || callback?.data === 'account:status') {
    const result = await request('/api/telegram-captain/internal/orders', {
      telegramUserId: String(sender.id), telegramChatId: String(chat.id),
    });
    const linked = result?.linked === true;
    const payload = {
      text: linked
        ? t(language, 'messages.accountLinked')
        : t(language, 'messages.accountUnlinked'),
      reply_markup: { inline_keyboard: [
        ...(linked ? [[{ text: t(language, 'buttons.orders'), callback_data: 'orders:refresh' }]] : []),
        [{ text: t(language, 'buttons.menu'), callback_data: 'menu:help' }],
      ] },
    };
    if (callback) await send('answerCallbackQuery', { callback_query_id: callback.id });
    await sendReadOnlyView(send, chat.id, payload, callback);
    return true;
  }

  // A one-tap view of the newest active order. Every request uses the
  // authenticated backend identity and current ownership, never cached data.
  if (/^\/latest(?:@\w+)?$/i.test(input) || callback?.data === 'orders:latest') {
    const result = await request('/api/telegram-captain/internal/orders', {
      telegramUserId: String(sender.id), telegramChatId: String(chat.id),
    });
    const linked = result?.linked === true;
    const first = linked && Array.isArray(result.orders)
      ? result.orders.find(o => o && /^[a-f0-9]{24}$/i.test(o.orderId || ''))
      : null;
    const payload = !linked
      ? { text: t(language, 'messages.unlinked') }
      : first
        ? {
          text: t(language, 'messages.latest') + formatOrder(first, language),
          reply_markup: { inline_keyboard: [
            [{ text: t(language, 'buttons.refreshLatest'), callback_data: 'status:' + first.orderId }],
            [{ text: t(language, 'buttons.allOrders'), callback_data: 'orders:refresh' }],
            [{ text: t(language, 'buttons.menu'), callback_data: 'menu:help' }],
          ] },
        }
        : {
          text: t(language, 'messages.empty'),
          reply_markup: { inline_keyboard: [
            [{ text: t(language, 'buttons.refreshShort'), callback_data: 'orders:latest' }],
            [{ text: t(language, 'buttons.menu'), callback_data: 'menu:help' }],
          ] },
        };
    if (callback) await send('answerCallbackQuery', { callback_query_id: callback.id });
    await sendReadOnlyView(send, chat.id, payload, callback);
    return true;
  }

  const filterCallback = /^orders:filter:(assigned|accepted|picked_up)$/.exec(callback?.data || '');
  const filterCommand = /^\/(?:orders|myorders)(?:@\w+)?\s+(assigned|accepted|picked_up)$/i.exec(input);
  if (/^\/(?:orders|myorders)(?:@\w+)?$/i.test(input) || callback?.data === 'orders:refresh' || filterCallback || filterCommand) {
    const filter = filterCallback?.[1] || filterCommand?.[1]?.toLowerCase() || null;
    const result = await request('/api/telegram-captain/internal/orders', {
      telegramUserId: String(sender.id), telegramChatId: String(chat.id),
      ...(filter ? { status: filter } : {}),
    });
    // Each button triggers a fresh ownership-checked backend lookup.
    const orders = result?.linked && Array.isArray(result.orders) ? result.orders.slice(0, 5) : [];
    const buttons = orders
      .filter(o => /^[a-f0-9]{24}$/i.test(o.orderId || ''))
      .map(o => [{ text: '🔎 #' + clean(o.reference, 6) + ' · ' +
        t(language, 'status.' + (ACTIVE_FILTERS.includes(o.status) ? o.status : 'unknown')), callback_data: 'status:' + o.orderId }]);
    const payload = !result?.linked
      ? { text: t(language, 'messages.unlinked') }
      : {
        text: !orders.length ? (filter
          ? t(language, 'messages.emptyFilter', { status: t(language, 'buttons.' + filter) })
          : t(language, 'messages.empty'))
          : t(language, filter ? 'messages.filteredList' : 'messages.orderList', {
            count: orders.length, status: filter ? t(language, 'buttons.' + filter) : '',
          }) + orders.map((order, index) => (index + 1) + '. ' + formatOrder(order, language)).join('\n\n'),
        reply_markup: { inline_keyboard: [
          ...buttons,
          [{ text: t(language, 'buttons.all'), callback_data: 'orders:refresh' },
            ...ACTIVE_FILTERS.map(status => ({ text: t(language, 'buttons.' + status), callback_data: 'orders:filter:' + status }))],
          [{ text: t(language, 'buttons.refresh'), callback_data: filter ? 'orders:filter:' + filter : 'orders:refresh' }],
          [{ text: t(language, 'buttons.menu'), callback_data: 'menu:help' }],
        ] },
      };
    // Acknowledge after the fresh authorization check; edit the active bot card.
    // Transient backend/Telegram errors still fail the webhook for retry.
    if (callback) await send('answerCallbackQuery', { callback_query_id: callback.id });
    await sendReadOnlyView(send, chat.id, payload, callback);
    return true;
  }
  // A full MongoDB order ID is required. Never resolve short references across accounts.
  // The backend independently verifies the private Telegram identity and order owner.
  const lookup = /^\/(?:order|status)(?:@\w+)?(?:\s+(.+))?$/i.exec(input);
  if (lookup) {
    const id = String(lookup[1] || '').trim();
    if (!/^[a-f0-9]{24}$/i.test(id)) {
      await send('sendMessage', {
        chat_id: chat.id,
        text: t(language, 'messages.invalidOrder'),
      });
      return true;
    }
    const result = await request('/api/telegram-captain/internal/order', {
      telegramUserId: String(sender.id), telegramChatId: String(chat.id), orderId: id,
    });
    const messageText = !result?.linked
      ? t(language, 'messages.unlinked')
      : !result.order
        ? t(language, 'messages.orderMissing')
        : t(language, 'messages.statusNow') + formatOrder(result.order, language);
    await send('sendMessage', {
      chat_id: chat.id, text: messageText,
      ...(result?.linked && result.order ? { reply_markup: orderButtons(result.order, language) } : {}),
    });
    return true;
  }
  if (callback?.data?.startsWith('status:')) {
    if (!/^status:[a-f0-9]{24}$/i.test(callback.data)) {
      await send('answerCallbackQuery', { callback_query_id: callback.id, text: t(language, 'messages.invalidCallback') });
      return true;
    }
    const result = await request('/api/telegram-captain/internal/order', {
      telegramUserId: String(sender.id), telegramChatId: String(chat.id),
      orderId: callback.data.slice(7),
    });
    const payload = !result?.linked ? t(language, 'messages.unlinked')
      : result.order ? t(language, 'messages.statusNow') + formatOrder(result.order, language)
        : t(language, 'messages.orderMissing');
    await send('answerCallbackQuery', { callback_query_id: callback.id });
    await sendReadOnlyView(send, chat.id, {
      text: payload,
      ...(result?.linked && result.order ? { reply_markup: orderButtons(result.order, language) } : {}),
    }, callback);
    return true;
  }
  return false;
}
async function deliverEvent(event, send, request = requestBackend, language = 'ar') {
  const result = await request('/api/telegram-captain/internal/resolve-event', {
    eventType: event.eventType, orderId: event.orderId, captainId: event.captainId, status: event.status,
  });
  if (!result?.deliver) return { skipped: true };
  const chatId = String(result.telegramChatId || '');
  if (!/^[0-9]{1,20}$/.test(chatId)) throw new Error('Invalid resolved Telegram chat');
  await send('sendMessage', {
    chat_id: chatId, text: (event.eventType === 'assigned' ? t(language, 'messages.assignedEvent') : t(language, 'messages.statusEvent')) +
      '\n' + formatOrder(result.order, language) + '\n\n' + t(language, 'messages.eventFooter'),
    reply_markup: orderButtons(result.order, language),
  });
  return { delivered: true };
}
module.exports = { handleReadOnlyCommand, deliverEvent, requestBackend, formatOrder, orderButtons, sendReadOnlyView };
