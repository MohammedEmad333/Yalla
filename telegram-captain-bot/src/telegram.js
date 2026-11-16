'use strict';
const { handleReadOnlyCommand } = require('./captainOrders');
const { handleNotificationSettings } = require('./notificationSettings');
const { createLanguageStore } = require('./languageStore');
const { t } = require('./i18n');
const languageStore = createLanguageStore();

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
  // Refresh can produce identical content; Telegram rejects no-op edits.
  // This is harmless and must not cause repeated webhook delivery.
  if (status === 400 && method === 'editMessageText') {
    return /message is not modified/.test(detail);
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

const HELP_TEXT = t('ar', 'help');
const PRIVACY_TEXT = t('ar', 'privacy');
function helpKeyboard(language = 'ar') {
  const button = (key, data) => ({ text: t(language, 'buttons.' + key), callback_data: data });
  return { inline_keyboard: [
    [button('orders', 'menu:orders')],
    [button('latest', 'menu:latest')],
    [button('account', 'menu:account')],
    [button('notifications', 'menu:notifications')],
    [button('language', 'menu:language')],
    [button('privacy', 'menu:privacy')],
    [button('help', 'menu:help')],
  ] };
}
function languageKeyboard() {
  return { inline_keyboard: [[
    { text: 'العربية', callback_data: 'language:set:ar' },
    { text: 'English', callback_data: 'language:set:en' },
  ], [{ text: '🏠 Menu / القائمة', callback_data: 'menu:help' }]] };
}
function sendMenuCard(send, chatId, callback, payload) {
  const messageId = callback?.message?.message_id;
  if (Number.isSafeInteger(messageId) && messageId > 0) {
    return send('editMessageText', { chat_id: chatId, message_id: messageId, ...payload });
  }
  return send('sendMessage', { chat_id: chatId, ...payload });
}

async function handleUpdate(update, send, preferences = languageStore) {
  const message = update?.message;
  const callback = update?.callback_query;
  const chat = message?.chat || callback?.message?.chat;
  if (!chat || chat.type !== 'private') return;
  if (callback && (!callback.from?.id || String(callback.from.id) !== String(chat.id))) return;
  if (message && (!message.from?.id || String(message.from.id) !== String(chat.id))) return;
  const language = preferences.get(chat.id);
  if (callback?.data?.startsWith('language:')) {
    if (callback.data === 'language:set:ar' || callback.data === 'language:set:en') {
      const selected = callback.data.slice('language:set:'.length);
      await preferences.set(chat.id, selected);
      await send('answerCallbackQuery', { callback_query_id: callback.id });
      await sendMenuCard(send, chat.id, callback, {
        text: t(selected, 'messages.languageSaved'), reply_markup: helpKeyboard(selected),
      });
    } else {
      await send('answerCallbackQuery', { callback_query_id: callback.id,
        text: t(language, 'messages.languageInvalid') });
    }
    return;
  }
  if (await handleNotificationSettings(update, send, undefined, language)) return;
  if (callback?.data?.startsWith('menu:')) {
    const action = callback.data.slice(5);
    if (action === 'account') {
      // Preserve callback identity and current message for safe in-place navigation.
      await handleReadOnlyCommand({
        callback_query: { ...callback, data: 'account:status' },
      }, send, undefined, language);
      return;
    }
    if (action === 'latest') {
      await handleReadOnlyCommand({
        callback_query: { ...callback, data: 'orders:latest' },
      }, send, undefined, language);
      return;
    }
    if (action === 'orders') {
      // Reuse the same callback to retain message ID and acknowledge once.
      await handleReadOnlyCommand({
        callback_query: { ...callback, data: 'orders:refresh' },
      }, send, undefined, language);
      return;
    }
    if (action === 'language') {
      await send('answerCallbackQuery', { callback_query_id: callback.id });
      await sendMenuCard(send, chat.id, callback, {
        text: t(language, 'messages.languagePrompt'), reply_markup: languageKeyboard(),
      });
      return;
    }
    if (action === 'help' || action === 'privacy') {
      await send('answerCallbackQuery', { callback_query_id: callback.id });
      const payload = {
        chat_id: chat.id,
        text: t(language, action),
        reply_markup: helpKeyboard(language),
      };
      if (Number.isSafeInteger(callback.message?.message_id) && callback.message.message_id > 0) {
        await send('editMessageText', { ...payload, message_id: callback.message.message_id });
      } else {
        await send('sendMessage', payload);
      }
      return;
    }
    await send('answerCallbackQuery', { callback_query_id: callback.id, text: t(language, 'messages.menuUnavailable') });
    return;
  }
  if (await handleReadOnlyCommand(update, send, undefined, language)) return;
  if (callback) {
    await send('answerCallbackQuery', { callback_query_id: callback.id, text: t(language, 'messages.useOrders') });
    return;
  }
  if (!message?.text || message.from?.is_bot || !message.from?.id) return;
  if (String(message.from.id) !== String(chat.id)) return;
  const input = message.text.trim();
  const command = /^\/(help|commands|privacy|start|menu|language|settings)(?:@\w+)?$/i.exec(input);
  if (command) {
    if (['language', 'settings'].includes(command[1].toLowerCase())) {
      await send('sendMessage', { chat_id: chat.id,
        text: t(language, 'messages.languagePrompt'), reply_markup: languageKeyboard() });
      return;
    }
    await send('sendMessage', {
      chat_id: chat.id,
      text: t(language, command[1].toLowerCase() === 'privacy' ? 'privacy' : 'help'),
      reply_markup: helpKeyboard(language), disable_web_page_preview: true,
    });
    return;
  }
  const match = /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{32})$/.exec(input);
  if (match) {
    const linked = await redeemPairing(match[1], message.from.id, chat.id);
    await send('sendMessage', { chat_id: chat.id, text: t(language, linked ? 'messages.pairingSuccess' : 'messages.pairingFailed') });
    return;
  }
  await send('sendMessage', {
    chat_id: chat.id,
    text: t(language, 'messages.unknown'),
    disable_web_page_preview: true,
  });
}
module.exports = { createTelegramClient, handleUpdate, redeemPairing, HELP_TEXT, PRIVACY_TEXT, helpKeyboard };
