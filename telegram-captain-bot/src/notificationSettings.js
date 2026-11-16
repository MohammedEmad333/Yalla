'use strict';
const { t, normalizeLanguage } = require('./i18n');
const { requestBackend, sendReadOnlyView } = require('./captainOrders');

const READ_PATH = '/api/telegram-captain/internal/notification-settings';
const WRITE_PATH = '/api/telegram-captain/internal/notification-settings/update';

async function handleNotificationSettings(update, send, request = requestBackend, language = 'ar') {
  const message = update?.message;
  const callback = update?.callback_query;
  const chat = message?.chat || callback?.message?.chat;
  const sender = callback?.from || message?.from;
  if (chat?.type !== 'private' || !sender?.id || String(sender.id) !== String(chat.id)) return false;
  const input = String(message?.text || '').trim();
  const isCommand = /^\/notifications(?:@\w+)?$/i.test(input);
  const isMenu = callback?.data === 'menu:notifications' || callback?.data === 'notifications:refresh';
  const match = /^notifications:set:(assigned|status):(on|off)$/.exec(callback?.data || '');
  if (!isCommand && !isMenu && !match) return false;
  language = normalizeLanguage(language);
  const body = { telegramUserId: String(sender.id), telegramChatId: String(chat.id) };
  let result;
  if (match) {
    // Desired state is encoded in callback, not a toggle. Duplicate Telegram
    // deliveries remain idempotent and reauthorization is performed each time.
    result = await request(WRITE_PATH, { ...body, kind: match[1], enabled: match[2] === 'on' });
  } else {
    result = await request(READ_PATH, body);
  }
  const linked = result?.linked === true;
  const controls = [];
  if (linked) {
    for (const kind of ['assigned', 'status']) {
      const enabled = result[kind] === true;
      controls.push([{ text: t(language, 'buttons.notification.' + kind) + ': ' +
        t(language, enabled ? 'buttons.notification.on' : 'buttons.notification.off'),
        callback_data: 'notifications:set:' + kind + ':' + (enabled ? 'off' : 'on') }]);
    }
    controls.push([{ text: t(language, 'buttons.notification.refresh'),
      callback_data: 'notifications:refresh' }]);
  }
  controls.push([{ text: t(language, 'buttons.menu'), callback_data: 'menu:help' }]);
  if (callback) await send('answerCallbackQuery', { callback_query_id: callback.id });
  await sendReadOnlyView(send, chat.id, {
    text: linked ? t(language, 'messages.notificationSettings') : t(language, 'messages.unlinked'),
    reply_markup: { inline_keyboard: controls },
  }, callback);
  return true;
}
module.exports = { handleNotificationSettings, READ_PATH, WRITE_PATH };
