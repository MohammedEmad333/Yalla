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

test('historical wallet debit respects funds reserved for active orders', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser();
  await walletService.creditWallet(user._id, 100);
  await Wallet.updateOne({ user: user._id }, { $set: { reservedBalance: 75 } });

  await assert.rejects(
    () => walletService.debitWallet(user._id, 30),
    /الرصيد المتاح غير كافٍ/
  );
  let wallet = await Wallet.findOne({ user: user._id });
  assert.equal(wallet.balance, 100);
  assert.equal(wallet.reservedBalance, 75);

  await walletService.debitWallet(user._id, 25);
  wallet = await Wallet.findOne({ user: user._id });
  assert.equal(wallet.balance, 75);
  assert.equal(wallet.reservedBalance, 75);
  const summary = await walletService.getWalletSummary(user._id);
  assert.equal(summary.availableBalance, 0);
});

test('historical wallet debit rejects a missing wallet without creating debt', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser();
  await assert.rejects(
    () => walletService.debitWallet(user._id, 1),
    /الرصيد المتاح غير كافٍ/
  );
  assert.equal(await Wallet.countDocuments({ user: user._id }), 0);
});

test('historical wallet balance summary distinguishes available and reserved funds', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser();
  await walletService.creditWallet(user._id, 200);
  await Wallet.updateOne({ user: user._id }, { $set: { reservedBalance: 45 } });
  const summary = await walletService.getWalletSummary(user._id);
  assert.deepEqual(summary, {
    balance: 200,
    reservedBalance: 45,
    availableBalance: 155,
    currency: 'ILS',
  });
});
