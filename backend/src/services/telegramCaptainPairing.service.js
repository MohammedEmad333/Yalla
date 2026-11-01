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
module.exports = { issueCode, unlink, hashCode };
