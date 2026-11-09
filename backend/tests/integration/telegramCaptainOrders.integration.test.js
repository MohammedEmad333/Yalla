'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { before, after, beforeEach } = require('node:test');
const { connect, disconnect, clearDb, state } = require('./setup');
const Captain = require('../../src/models/Captain');
const Link = require('../../src/models/TelegramCaptainLink');
const Order = require('../../src/models/Order');
const orders = require('../../src/services/telegramCaptainOrders.service');

before(connect);
after(disconnect);
beforeEach(clearDb);

async function fixture() {
  const captain = await Captain.create({
    name: 'Captain one', phone: '0599000009',
    passwordHash: 'test-only', isApproved: true,
  });
  const stranger = await Captain.create({
    name: 'Captain two', phone: '0599000010',
    passwordHash: 'test-only', isApproved: true,
  });
  await Link.create({ captainId: captain._id, telegramUserId: '54321', telegramChatId: '54321' });
  const loc = (address) => ({
    address, location: { type: 'Point', coordinates: [35.25, 32.2] },
  });
  const makeOrder = (captainId, status, merchant) => Order.create({
    user: new mongoose.Types.ObjectId(),
    captain: captainId, status,
    pickup: loc('Private pickup street'),
    dropoff: loc('Private customer address'),
    store: { name: merchant },
    timeline: { assignedAt: new Date(), acceptedAt: new Date(), deliveredAt: new Date() },
  });
  const mine = await makeOrder(captain._id, 'assigned', 'Market A');
  const others = await makeOrder(stranger._id, 'assigned', 'Market B');
  return { captain, stranger, mine, others };
}

test('private Telegram chat lists only active orders owned by the linked approved captain', async (t) => {
  if (!state.dbReady) return t.skip('MongoDB unavailable');
  const { mine, others } = await fixture();
  const result = await orders.listOrdersForTelegram({ telegramUserId: '54321', telegramChatId: '54321' });
  assert.equal(result.linked, true);
  assert.equal(result.orders.length, 1);
  assert.equal(result.orders[0].orderId, String(mine._id));
  assert.notEqual(result.orders[0].orderId, String(others._id));
  assert.deepEqual(Object.keys(result.orders[0]).sort(), ['orderId', 'reference', 'status', 'storeName']);
  assert.ok(!JSON.stringify(result).includes('Private'));
});

test('unlinked / forged Telegram identities cannot read orders', async (t) => {
  if (!state.dbReady) return t.skip('MongoDB unavailable');
  await fixture();
  assert.deepEqual(await orders.listOrdersForTelegram({
    telegramUserId: '54321', telegramChatId: '11111',
  }), { linked: false, orders: [] });
  assert.deepEqual(await orders.getOrderForTelegram({
    telegramUserId: '123456', telegramChatId: '123456', orderId: 'a'.repeat(24),
  }), { linked: false, order: null });
});

test('order details reject other captains and revalidate after unlink', async (t) => {
  if (!state.dbReady) return t.skip('MongoDB unavailable');
  const { mine, others, captain } = await fixture();
  assert.equal((await orders.getOrderForTelegram({
    telegramUserId: '54321', telegramChatId: '54321', orderId: String(mine._id),
  })).order.status, 'assigned');
  assert.equal((await orders.getOrderForTelegram({
    telegramUserId: '54321', telegramChatId: '54321', orderId: String(others._id),
  })).order, null);
  await Link.deleteOne({ captainId: captain._id });
  assert.equal((await orders.getOrderForTelegram({
    telegramUserId: '54321', telegramChatId: '54321', orderId: String(mine._id),
  })).linked, false);
});

test('event resolution drops stale status, reassigned order or revoked link', async (t) => {
  if (!state.dbReady) return t.skip('MongoDB unavailable');
  const { mine, captain, stranger } = await fixture();
  const good = await orders.resolveOrderEvent({
    orderId: String(mine._id), captainId: String(captain._id), status: 'assigned', eventType: 'assigned',
  });
  assert.equal(good.deliver, true);
  assert.equal(good.telegramChatId, '54321');
  assert.ok(!JSON.stringify(good).includes('Private'));
  assert.deepEqual(await orders.resolveOrderEvent({
    orderId: String(mine._id), captainId: String(captain._id), status: 'delivered', eventType: 'status',
  }), { deliver: false });
  await Order.updateOne({ _id: mine._id }, { $set: { captain: stranger._id } });
  assert.deepEqual(await orders.resolveOrderEvent({
    orderId: String(mine._id), captainId: String(captain._id), status: 'assigned', eventType: 'assigned',
  }), { deliver: false });
});

test('unapproved captain loses Telegram read access', async (t) => {
  if (!state.dbReady) return t.skip('MongoDB unavailable');
  const { captain } = await fixture();
  await Captain.updateOne({ _id: captain._id }, { $set: { isApproved: false } });
  assert.equal((await orders.listOrdersForTelegram({
    telegramUserId: '54321', telegramChatId: '54321',
  })).linked, false);
});
