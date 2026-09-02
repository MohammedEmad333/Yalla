'use strict';

// اختبارات تكامل للإسناد التلقائي (بثّ الطلبات لكل الكباتن ومنافسة القبول).
// تتخطّى نفسها تلقائيًا إن لم تتوفّر قاعدة بيانات (انظر setup.js).
//
// التشغيل:  npm run test:integration

const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after, beforeEach } = require('node:test');

const { connect, disconnect, clearDb, state } = require('./setup');

const User = require('../../src/models/User');
const Captain = require('../../src/models/Captain');
const Order = require('../../src/models/Order');
const orderService = require('../../src/services/order.service');
const settingsService = require('../../src/services/settings.service');
const walletService = require('../../src/services/wallet.service');
const { ORDER_STATUS, CAPTAIN_STATUS } = require('../../src/utils/constants');

const PICKUP = [31.2357, 30.0444];
const DROPOFF = [31.2000, 30.0600];

before(async () => {
  await connect();
  if (state.dbReady) await Captain.init();
});
after(async () => {
  settingsService._clearCache();
  await disconnect();
});
beforeEach(async () => {
  await clearDb();
  settingsService._clearCache();
});

async function makeUser() {
  const u = new User({ name: 'مستخدم', phone: `u${Date.now()}${Math.random()}` });
  await u.setPassword('secret1');
  await u.save();
  await walletService.creditWallet(u._id, 100000);
  return u;
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
const orderPayload = () => ({
  pickup: { address: 'الاستلام', location: { type: 'Point', coordinates: PICKUP } },
  dropoff: { address: 'التسليم', location: { type: 'Point', coordinates: DROPOFF } },
  packageNote: 'طرد',
});

test('البثّ: إنشاء طلب في وضع الإسناد التلقائي يعلّمه كمبثوث ويبقى pending', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  await settingsService.updateSettings({ autoAssignBroadcast: true });
  const user = await makeUser();
  await makeCaptain();

  const order = await orderService.createOrder(user._id, orderPayload());
  assert.equal(order.status, ORDER_STATUS.PENDING);
  assert.equal(order.broadcast, true, 'الطلب مبثوث لكل الكباتن');
  assert.equal(order.captain, null, 'لا كابتن مُسنَد قبل القبول');
});

test('القبول: أوّل كابتن يقبل يظفر بالطلب ويصبح accepted و busy', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  await settingsService.updateSettings({ autoAssignBroadcast: true });
  const user = await makeUser();
  const captain = await makeCaptain();

  const order = await orderService.createOrder(user._id, orderPayload());
  const claimed = await orderService.claimOrder(captain._id, order._id);

  assert.equal(claimed.status, ORDER_STATUS.ACCEPTED);
  assert.equal(String(claimed.captain._id || claimed.captain), String(captain._id));
  assert.equal(claimed.broadcast, false, 'انتهى البثّ بعد القبول');

  const fresh = await Captain.findById(captain._id);
  assert.equal(fresh.status, CAPTAIN_STATUS.BUSY);
  assert.equal(fresh.activeOrdersCount, 1);
});

test('المنافسة: الكابتن الثاني يحصل على 409 (لم يعد الطلب متاحًا)', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  await settingsService.updateSettings({ autoAssignBroadcast: true });
  const user = await makeUser();
  const first = await makeCaptain();
  const second = await makeCaptain();

  const order = await orderService.createOrder(user._id, orderPayload());
  await orderService.claimOrder(first._id, order._id);

  await assert.rejects(
    () => orderService.claimOrder(second._id, order._id),
    (err) => err.statusCode === 409
  );
});

test('القائمة المتاحة: تُظهر الطلبات المبثوثة وتستثني ما رفضه الكابتن', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  await settingsService.updateSettings({ autoAssignBroadcast: true });
  const user = await makeUser();
  const captain = await makeCaptain();

  const order = await orderService.createOrder(user._id, orderPayload());
  let available = await orderService.getAvailableBroadcastOrders(captain._id);
  assert.equal(available.length, 1);
  assert.equal(String(available[0]._id), String(order._id));

  // بعد وضع الكابتن في قائمة الرافضين لا يظهر له الطلب
  await Order.updateOne({ _id: order._id }, { $push: { rejectedBy: captain._id } });
  available = await orderService.getAvailableBroadcastOrders(captain._id);
  assert.equal(available.length, 0);
});

test('التفعيل يبثّ الطلبات المعلّقة القائمة', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  // البثّ متوقّف عند الإنشاء
  await settingsService.updateSettings({ autoAssignBroadcast: false });
  const user = await makeUser();
  await makeCaptain();
  const order = await orderService.createOrder(user._id, orderPayload());
  assert.equal(order.broadcast, false);

  // تفعيل الإسناد التلقائي يبثّ الطلبات المعلّقة القائمة
  const count = await orderService.broadcastPendingOrders();
  assert.ok(count >= 1);
  const fresh = await Order.findById(order._id);
  assert.equal(fresh.broadcast, true);
});
