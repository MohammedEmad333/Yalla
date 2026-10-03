'use strict';

// Historical customer-wallet ledger compatibility only.
// Customer top-up and withdrawal flows were retired in favor of direct Jawwal Pay order payments.

const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after, beforeEach } = require('node:test');

const { connect, disconnect, clearDb, state } = require('./setup');

const User = require('../../src/models/User');
const Wallet = require('../../src/models/Wallet');
const walletService = require('../../src/services/wallet.service');

before(connect);
after(disconnect);
beforeEach(clearDb);

async function makeUser() {
  const u = new User({ name: 'عميل', phone: `u${Date.now()}${Math.random()}` });
  await u.setPassword('secret1');
  return u.save();
}

test('historical wallet ledger prevents a negative balance', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser();
  await walletService.creditWallet(user._id, 100);

  await walletService.debitWallet(user._id, 60);
  let wallet = await Wallet.findOne({ user: user._id });
  assert.equal(wallet.balance, 40);

  await assert.rejects(() => walletService.debitWallet(user._id, 1000));
  wallet = await Wallet.findOne({ user: user._id });
  assert.equal(wallet.balance, 40);
});
