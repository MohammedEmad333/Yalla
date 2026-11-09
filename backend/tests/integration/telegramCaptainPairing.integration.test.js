'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after, beforeEach } = require('node:test');
const { connect, disconnect, clearDb, state } = require('./setup');
const Captain = require('../../src/models/Captain');
const Link = require('../../src/models/TelegramCaptainLink');
const Pairing = require('../../src/models/TelegramCaptainPairing');
const pairing = require('../../src/services/telegramCaptainPairing.service');

before(connect);
after(disconnect);
beforeEach(clearDb);

let nextPhone = 0;
async function createCaptain(isApproved = true) {
  nextPhone += 1;
  return Captain.create({
    name: 'Test captain',
    phone: '059900' + String(nextPhone).padStart(4, '0'),
    passwordHash: 'test-only',
    isApproved,
  });
}

test('approved captain can link once and repeat the same update safely', async (t) => {
  if (!state.dbReady) return t.skip('No MongoDB');
  const captain = await createCaptain();
  const { code, expiresInSeconds } = await pairing.issueCode(captain._id);
  assert.equal(code.length, 32);
  assert.equal(expiresInSeconds, 300);
  assert.deepEqual(await pairing.redeemCode({
    code, telegramUserId: '12345', telegramChatId: '12345',
  }), { linked: true });
  assert.deepEqual(await pairing.redeemCode({
    code, telegramUserId: '12345', telegramChatId: '12345',
  }), { linked: true });
  assert.equal(await Link.countDocuments({ captainId: captain._id }), 1);
});

test('expired pairing codes are rejected', async (t) => {
  if (!state.dbReady) return t.skip('No MongoDB');
  const captain = await createCaptain();
  const { code } = await pairing.issueCode(captain._id);
  await Pairing.updateOne({ captainId: captain._id }, {
    $set: { expiresAt: new Date(Date.now() - 1000) },
  });
  await assert.rejects(() => pairing.redeemCode({
    code, telegramUserId: '12345', telegramChatId: '12345',
  }), { status: 400 });
});

test('wrong Telegram chat cannot redeem and other user cannot replay', async (t) => {
  if (!state.dbReady) return t.skip('No MongoDB');
  const captain = await createCaptain();
  const { code } = await pairing.issueCode(captain._id);
  await assert.rejects(() => pairing.redeemCode({
    code, telegramUserId: '12345', telegramChatId: '54321',
  }), { status: 400 });
  await pairing.redeemCode({ code, telegramUserId: '12345', telegramChatId: '12345' });
  await assert.rejects(() => pairing.redeemCode({
    code, telegramUserId: '56789', telegramChatId: '56789',
  }), { status: 400 });
});

test('non-approved captain cannot issue or complete pairing', async (t) => {
  if (!state.dbReady) return t.skip('No MongoDB');
  const pending = await createCaptain(false);
  await assert.rejects(() => pairing.issueCode(pending._id), { status: 403 });
  const approved = await createCaptain(true);
  const { code } = await pairing.issueCode(approved._id);
  approved.isApproved = false;
  await approved.save();
  await assert.rejects(() => pairing.redeemCode({
    code, telegramUserId: '12345', telegramChatId: '12345',
  }), { status: 403 });
  assert.equal(await Link.countDocuments({}), 0);
});

test('unlink invalidates old codes, then a new code may pair again', async (t) => {
  if (!state.dbReady) return t.skip('No MongoDB');
  const captain = await createCaptain();
  const { code } = await pairing.issueCode(captain._id);
  await pairing.redeemCode({ code, telegramUserId: '12345', telegramChatId: '12345' });
  await pairing.unlink(captain._id);
  assert.deepEqual(await pairing.getLinkStatus(captain._id), { linked: false, linkedAt: null });
  await assert.rejects(() => pairing.redeemCode({
    code, telegramUserId: '12345', telegramChatId: '12345',
  }), { status: 400 });
  const fresh = await pairing.issueCode(captain._id);
  await pairing.redeemCode({
    code: fresh.code, telegramUserId: '12345', telegramChatId: '12345',
  });
  assert.equal(await Link.countDocuments({ captainId: captain._id }), 1);
});

test('concurrent competing code redemptions cannot create two links', async (t) => {
  if (!state.dbReady) return t.skip('No MongoDB');
  const captain = await createCaptain();
  const { code } = await pairing.issueCode(captain._id);
  const result = await Promise.allSettled([
    pairing.redeemCode({ code, telegramUserId: '11111', telegramChatId: '11111' }),
    pairing.redeemCode({ code, telegramUserId: '22222', telegramChatId: '22222' }),
  ]);
  assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(await Link.countDocuments({ captainId: captain._id }), 1);
});
