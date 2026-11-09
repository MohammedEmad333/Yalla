'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after, beforeEach } = require('node:test');
const { connect, disconnect, clearDb, state } = require('./setup');
const User = require('../../src/models/User');
const Order = require('../../src/models/Order');
const WalletHold = require('../../src/models/WalletHold');
const Log = require('../../src/models/Log');
const walletService = require('../../src/services/wallet.service');
const adminOrder = require('../../src/services/adminOrder.service');
const { ORDER_STATUS } = require('../../src/utils/constants');

before(connect);
after(disconnect);
beforeEach(clearDb);

async function makeUser(name, phone, role = 'user', extra = {}) {
  const user = new User({ name, phone, role, ...extra });
  await user.setPassword('a-test-password');
  await user.save();
  return user;
}

function input(userId) {
  return {
    userId: String(userId),
    pickup: { city: 'غزة', neighborhood: 'الرمال', street: 'شارع أ' },
    dropoff: { city: 'غزة', neighborhood: 'الزيتون', street: 'شارع ب' },
    packageNote: 'صندوق',
  };
}

test('admin previews price and available customer balance without creating orders', async (t) => {
  if (!state.dbReady) return t.skip('MongoDB unavailable');
  const admin = await makeUser('Admin', '0597000110', 'admin', { adminRole: 'operations', regions: ['غزة'] });
  const customer = await makeUser('Customer', '0597000111');
  await walletService.creditWallet(customer._id, 200);
  const quote = await adminOrder.preview(input(customer._id), admin._id);
  assert.ok(quote.price >= 8);
  assert.equal(quote.availableBalance, 200);
  assert.equal(quote.sufficientBalance, true);
  assert.equal(await Order.countDocuments({}), 0);
});

test('admin creates a wallet-held order once and writes audit log', async (t) => {
  if (!state.dbReady) return t.skip('MongoDB unavailable');
  const admin = await makeUser('Admin', '0597000112', 'admin', { adminRole: 'operations', regions: ['غزة'] });
  const customer = await makeUser('Customer', '0597000113');
  await walletService.creditWallet(customer._id, 200);
  const params = { ...input(customer._id), requestKey: 'test-order-request-12345' };
  const created = await adminOrder.create(params, admin._id);
  assert.equal(created.reused, false);
  const order = await Order.findById(created.id);
  assert.equal(order.status, ORDER_STATUS.PENDING);
  assert.equal(String(order.user), String(customer._id));
  assert.ok(order.price >= 8);
  assert.equal((await WalletHold.findOne({ order: order._id })).amount, order.price);
  assert.equal((await Log.countDocuments({ action: 'ORDER_CREATED_BY_ADMIN' })), 1);

  const repeated = await adminOrder.create(params, admin._id);
  assert.equal(repeated.id, created.id);
  assert.equal(repeated.reused, true);
  assert.equal(await Order.countDocuments({}), 1);
  assert.equal((await Log.countDocuments({ action: 'ORDER_CREATED_BY_ADMIN' })), 1);
});

test('insufficient funds and restricted admin regions prevent order creation', async (t) => {
  if (!state.dbReady) return t.skip('MongoDB unavailable');
  const admin = await makeUser('Admin', '0597000114', 'admin', { adminRole: 'operations', regions: ['رفح'] });
  const customer = await makeUser('Customer', '0597000115');
  const params = { ...input(customer._id), requestKey: 'test-order-request-12346' };
  await assert.rejects(() => adminOrder.create(params, admin._id), { statusCode: 403 });
  await User.updateOne({ _id: admin._id }, { $set: { regions: ['غزة'] } });
  const quote = await adminOrder.preview(input(customer._id), admin._id);
  assert.equal(quote.sufficientBalance, false);
  await assert.rejects(() => adminOrder.create(params, admin._id), /الرصيد/);
  assert.equal(await Order.countDocuments({}), 0);
});

test('support cannot create orders, disabled customer cannot be targeted', async (t) => {
  if (!state.dbReady) return t.skip('MongoDB unavailable');
  const support = await makeUser('Support', '0597000116', 'admin', { adminRole: 'support' });
  const customer = await makeUser('Customer', '0597000117');
  await assert.rejects(() => adminOrder.create({ ...input(customer._id), requestKey: 'test-order-request-12347' }, support._id), { statusCode: 403 });
  const operator = await makeUser('Operator', '0597000118', 'admin', { adminRole: 'operations' });
  await User.updateOne({ _id: customer._id }, { $set: { isActive: false } });
  await assert.rejects(() => adminOrder.preview(input(customer._id), operator._id), { statusCode: 404 });
});
