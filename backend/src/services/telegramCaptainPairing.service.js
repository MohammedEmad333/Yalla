'use strict';
const { randomBytes, createHash } = require('node:crypto');
const Captain = require('../models/Captain');
const Pairing = require('../models/TelegramCaptainPairing');
const Link = require('../models/TelegramCaptainLink');
const TTL_MS = 300000;
function hashCode(code) { return createHash('sha256').update(code).digest('hex'); }
async function issueCode(captainId) {
  if (!await Captain.exists({ _id: captainId, isApproved: true })) {
    const err = new Error('Captain account is not approved'); err.status = 403; throw err;
  }
  const code = randomBytes(24).toString('base64url');
  await Pairing.deleteMany({ captainId });
  await Pairing.create({ captainId, codeHash: hashCode(code), expiresAt: new Date(Date.now() + TTL_MS) });
  return { code, expiresInSeconds: TTL_MS / 1000 };
}
async function unlink(captainId) {
  await Pairing.deleteMany({ captainId });
  await Link.deleteOne({ captainId });
}

function invalidPairing() {
  const err = new Error('Invalid or expired Telegram pairing code');
  err.status = 400;
  return err;
}

async function redeemCode({ code, telegramUserId, telegramChatId }) {
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{32}$/.test(code)) throw invalidPairing();
  if (!/^\d{1,20}$/.test(String(telegramUserId)) || !/^\d{1,20}$/.test(String(telegramChatId))) {
    throw invalidPairing();
  }
  const userId = String(telegramUserId);
  const chatId = String(telegramChatId);
  if (userId !== chatId) throw invalidPairing(); // Only private Telegram chats may link accounts.
  const existing = await Link.findOne({ telegramUserId: userId });
  if (existing) {
    const err = new Error('Telegram account already linked');
    err.status = 409;
    throw err;
  }
  const pairing = await Pairing.findOneAndUpdate(
    { codeHash: hashCode(code), consumedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { consumedAt: new Date() } },
    { new: true }
  );
  if (!pairing) throw invalidPairing();
  if (!await Captain.exists({ _id: pairing.captainId, isApproved: true })) {
    const err = new Error('Captain account is not approved');
    err.status = 403;
    throw err;
  }
  try {
    await Link.create({ captainId: pairing.captainId, telegramUserId: userId, telegramChatId: chatId });
  } catch (err) {
    if (err.code === 11000) {
      const conflict = new Error('Captain or Telegram account already linked');
      conflict.status = 409;
      throw conflict;
    }
    throw err;
  }
  return { linked: true };
}

module.exports = { issueCode, unlink, hashCode, redeemCode };
