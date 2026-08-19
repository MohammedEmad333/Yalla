'use strict';

// اختبارات تكامل لحذف الحساب ذاتيًا (متطلّب Google Play) — على قاعدة بيانات حقيقية.
// تتخطّى نفسها تلقائيًا إن لم تتوفّر قاعدة بيانات (انظر setup.js).
//
// التشغيل:  npm run test:integration

const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after, beforeEach } = require('node:test');

const { connect, disconnect, clearDb, state } = require('./setup');

const User = require('../../src/models/User');
const Captain = require('../../src/models/Captain');
const Wallet = require('../../src/models/Wallet');
const Notification = require('../../src/models/Notification');
const SupportMessage = require('../../src/models/SupportMessage');
const Order = require('../../src/models/Order');
const adminService = require('../../src/services/admin.service');
const walletService = require('../../src/services/wallet.service');
const { ORDER_STATUS, CAPTAIN_STATUS, ROLES } = require('../../src/utils/constants');

const PICKUP = [31.2357, 30.0444];
const DROPOFF = [31.2, 30.06];

before(async () => {
  await connect();
  if (state.dbReady) await Captain.init();
});
after(disconnect);
beforeEach(clearDb);

async function makeUser() {
  const u = new User({ name: 'عميل', phone: `u${Date.now()}${Math.random()}` });
  await u.setPassword('secret1');
  return u.save();
}
async function makeCaptain(extra = {}) {
  const c = new Captain({
    name: 'كابتن',
    phone: `c${Date.now()}${Math.random()}`,
    status: CAPTAIN_STATUS.ONLINE,
    isApproved: true,
    currentLocation: { type: 'Point', coordinates: PICKUP },
    ...extra,
  });
  await c.setPassword('secret1');
  return c.save();
}

test('حذف الزبون ذاتيًا يمحو الحساب وبياناته المرتبطة', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser();
  await walletService.creditWallet(user._id, 50);
  await Notification.create({
    recipient: user._id,
    recipientRole: 'user',
    type: 'ORDER_STATUS',
    title: 'مرحبًا',
    body: 'أهلًا',
  });
  await SupportMessage.create({ user: user._id, senderRole: 'user', text: 'استفسار' });

  const res = await adminService.deleteUser(user._id, ROLES.USER);
  assert.equal(res.deleted, true);

  assert.equal(await User.countDocuments({ _id: user._id }), 0);
  assert.equal(await Wallet.countDocuments({ user: user._id }), 0);
  assert.equal(await Notification.countDocuments({ recipient: user._id }), 0);
  assert.equal(await SupportMessage.countDocuments({ user: user._id }), 0);
});

test('يُمنع حذف الزبون أثناء وجود طلب نشط', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser();
  await Order.create({
    user: user._id,
    pickup: { address: 'الاستلام', location: { type: 'Point', coordinates: PICKUP } },
    dropoff: { address: 'التسليم', location: { type: 'Point', coordinates: DROPOFF } },
    status: ORDER_STATUS.PENDING,
  });

  await assert.rejects(() => adminService.deleteUser(user._id, ROLES.USER), /طلب نشط/);
  assert.equal(await User.countDocuments({ _id: user._id }), 1);
});

test('حذف الكابتن ذاتيًا يمحو الحساب', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const captain = await makeCaptain();

  const res = await adminService.deleteCaptain(captain._id, ROLES.CAPTAIN);
  assert.equal(res.deleted, true);
  assert.equal(await Captain.countDocuments({ _id: captain._id }), 0);
});

test('يُمنع حذف الكابتن المشغول بطلب نشط', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const captain = await makeCaptain({ status: CAPTAIN_STATUS.BUSY });
  const order = await Order.create({
    user: (await makeUser())._id,
    captain: captain._id,
    pickup: { address: 'الاستلام', location: { type: 'Point', coordinates: PICKUP } },
    dropoff: { address: 'التسليم', location: { type: 'Point', coordinates: DROPOFF } },
    status: ORDER_STATUS.ACCEPTED,
  });
  captain.activeOrder = order._id;
  await captain.save();

  await assert.rejects(() => adminService.deleteCaptain(captain._id, ROLES.CAPTAIN), /طلب نشط/);
  assert.equal(await Captain.countDocuments({ _id: captain._id }), 1);
});
