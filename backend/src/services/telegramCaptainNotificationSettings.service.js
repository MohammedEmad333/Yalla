'use strict';
const Link = require('../models/TelegramCaptainLink');
const { linkedCaptain } = require('./telegramCaptainOrders.service');
const TYPES = Object.freeze(['assigned', 'status']);

function publicPreferences(link) {
  return {
    linked: true,
    assigned: link?.notificationPreferences?.assigned !== false,
    status: link?.notificationPreferences?.status !== false,
  };
}
async function currentLink({ telegramUserId, telegramChatId }) {
  const captainId = await linkedCaptain(telegramUserId, telegramChatId);
  if (!captainId) return null;
  return Link.findOne({
    captainId,
    telegramUserId: String(telegramUserId),
    telegramChatId: String(telegramChatId),
  }).select('notificationPreferences').lean();
}
async function getSettings(body = {}) {
  const link = await currentLink(body);
  return link ? publicPreferences(link) : { linked: false };
}
async function setSettings(body = {}) {
  if (!TYPES.includes(body.kind) || typeof body.enabled !== 'boolean') {
    const err = new Error('Invalid notification setting'); err.status = 400; throw err;
  }
  const captainId = await linkedCaptain(body.telegramUserId, body.telegramChatId);
  if (!captainId) return { linked: false };
  const link = await Link.findOneAndUpdate({
    captainId,
    telegramUserId: String(body.telegramUserId),
    telegramChatId: String(body.telegramChatId),
  }, { $set: { ['notificationPreferences.' + body.kind]: body.enabled } },
  { new: true, runValidators: true }).select('notificationPreferences').lean();
  return link ? publicPreferences(link) : { linked: false };
}
module.exports = { getSettings, setSettings, publicPreferences };
