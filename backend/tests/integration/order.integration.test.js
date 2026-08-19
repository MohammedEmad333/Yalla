'use strict';

// اختبارات تكامل لدورة حياة الطلب — تعمل على قاعدة بيانات حقيقية.
// تتخطّى نفسها تلقائيًا إن لم تتوفّر قاعدة بيانات (انظر setup.js).
//
// التشغيل:  npm run test:integration
// (أو مع مونجو خاص:  TEST_MONGO_URI=mongodb://localhost:27017/yalla_test npm run test:integration)

const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after, beforeEach } = require('node:test');

const { connect, disconnect, clearDb, state } = require('./setup');

const User = require('../../src/models/User');
const Captain = require('../../src/models/Captain');
const Order = require('../../src/models/Order');
const orderService = require('../../src/services/order.service');
const walletService = require('../../src/services/wallet.service');
const { ORDER_STATUS, CAPTAIN_STATUS } = require('../../src/utils/constants');

// إحداثيات اختبار [lng, lat]
const PICKUP = [31.2357, 30.0444];
const DROPOFF = [31.2000, 30.0600];

before(async () => {
  await connect();
  if (state.dbReady) {
    // نبني الفهارس (خاصةً 2dsphere) قبل استعلامات القرب
    await Captain.init();
  }
});
after(disconnect);
beforeEach(clearDb);

// مساعدات إنشاء بيانات
async function makeUser() {
  const u = new User({ name: 'مستخدم', phone: `u${Date.now()}${Math.random()}` });
  await u.setPassword('secret1');
  await u.save();
  // Card 27: نموّل محفظة المستخدم حتى تكفي للسعر التقريبي عند إنشاء الطلبات
  await walletService.creditWallet(u._id, 100000);
  return u;
}
async function makeCaptain(coords = PICKUP, extra = {}) {
  const c = new Captain({
    name: 'كابتن',
    phone: `c${Date.now()}${Math.random()}`,
    status: CAPTAIN_STATUS.ONLINE,
    isApproved: true,
    currentLocation: { type: 'Point', coordinates: coords },
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

test('إنشاء الطلب: يحسب السعر والمسافة ويبدأ pending', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser();
  const order = await orderService.createOrder(user._id, orderPayload());

  assert.equal(order.status, ORDER_STATUS.PENDING);
  assert.ok(order.price > 0, 'السعر يُحسب في الخادم');
  assert.ok(order.distanceKm > 0, 'المسافة تُحسب في الخادم');
});

test('منع التكرار: نفس Idempotency-Key يعيد الطلب ذاته', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser();
  const key = 'dup-key-123';

  const first = await orderService.createOrder(user._id, orderPayload(), key);
  const second = await orderService.createOrder(user._id, orderPayload(), key);

  assert.equal(String(first._id), String(second._id), 'لم يُنشأ طلب ثانٍ');
  const count = await require('../../src/models/Order').countDocuments({ user: user._id });
  assert.equal(count, 1);
});

test('الإسناد اليدوي: يربط الكابتن ويجعله busy', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const [user, captain] = [await makeUser(), await makeCaptain()];
  const admin = await makeUser();

  const order = await orderService.createOrder(user._id, orderPayload());
  const assigned = await orderService.assignOrder(admin._id, order._id, captain._id);

  assert.equal(assigned.status, ORDER_STATUS.ASSIGNED);
  const freshCaptain = await Captain.findById(captain._id);
  assert.equal(freshCaptain.status, CAPTAIN_STATUS.BUSY);
  assert.equal(String(freshCaptain.activeOrder), String(order._id));
});

test('انتقالات الحالة: accepted → picked_up → delivered تحرّر الكابتن', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const [user, captain, admin] = [await makeUser(), await makeCaptain(), await makeUser()];
  const order = await orderService.createOrder(user._id, orderPayload());
  await orderService.assignOrder(admin._id, order._id, captain._id);

  await orderService.updateOrderStatus(captain._id, order._id, ORDER_STATUS.ACCEPTED);
  await orderService.updateOrderStatus(captain._id, order._id, ORDER_STATUS.PICKED_UP);
  // Card 20 + 27: التسليم يتطلّب رمز صاحب الطلب + السعر الحقيقي (≤ التقريبي)
  const delivered = await orderService.updateOrderStatus(
    captain._id, order._id, ORDER_STATUS.DELIVERED, '', order.deliveryCode, order.price
  );

  assert.equal(delivered.status, ORDER_STATUS.DELIVERED);
  // Card 27: السعر الحقيقي محفوظ ونسبة الكابتن ٨٠٪
  assert.equal(delivered.finalPrice, order.price);
  assert.equal(delivered.captainNet, Math.round(order.price * 0.8));
  const freshCaptain = await Captain.findById(captain._id);
  assert.equal(freshCaptain.status, CAPTAIN_STATUS.ONLINE, 'يعود متاحًا بعد التسليم');
  assert.equal(freshCaptain.activeOrder, null);
});

test('التسليم: السعر الحقيقي أعلى من التقريبي مرفوض (Card 27)', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const [user, captain, admin] = [await makeUser(), await makeCaptain(), await makeUser()];
  const order = await orderService.createOrder(user._id, orderPayload());
  await orderService.assignOrder(admin._id, order._id, captain._id);
  await orderService.updateOrderStatus(captain._id, order._id, ORDER_STATUS.ACCEPTED);
  await orderService.updateOrderStatus(captain._id, order._id, ORDER_STATUS.PICKED_UP);

  await assert.rejects(
    () => orderService.updateOrderStatus(
      captain._id, order._id, ORDER_STATUS.DELIVERED, '', order.deliveryCode, order.price + 50
    ),
    /يجب ألّا يتجاوز/
  );
});

test('التسليم: الطلبات القديمة بلا رمز تسليم تُغلَق دون رمز', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const [user, captain, admin] = [await makeUser(), await makeCaptain(), await makeUser()];
  const order = await orderService.createOrder(user._id, orderPayload());
  await orderService.assignOrder(admin._id, order._id, captain._id);
  await orderService.updateOrderStatus(captain._id, order._id, ORDER_STATUS.ACCEPTED);
  await orderService.updateOrderStatus(captain._id, order._id, ORDER_STATUS.PICKED_UP);

  // نحاكي طلبًا قديمًا سابقًا لميزة رمز التسليم: نُفرّغ الرمز المخزّن.
  await Order.updateOne({ _id: order._id }, { $set: { deliveryCode: '' } });

  // يجب أن يُقبل التسليم دون رمز لأنّ الطلب لا يملك رمزًا أصلًا.
  const delivered = await orderService.updateOrderStatus(
    captain._id, order._id, ORDER_STATUS.DELIVERED, '', '', order.price
  );
  assert.equal(delivered.status, ORDER_STATUS.DELIVERED);
});

test('إنشاء الطلب: يُرفض إن لم يكفِ رصيد المحفظة (Card 27)', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  // مستخدم بلا رصيد (نُنشئه يدويًّا بلا تمويل)
  const poor = new User({ name: 'فقير', phone: `p${Date.now()}${Math.random()}` });
  await poor.setPassword('secret1');
  await poor.save();

  await assert.rejects(
    () => orderService.createOrder(poor._id, orderPayload()),
    /لا يكفي|اشحن محفظتك/
  );
});

test('انتقال غير مسموح: pending → delivered مرفوض', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const [user, captain, admin] = [await makeUser(), await makeCaptain(), await makeUser()];
  const order = await orderService.createOrder(user._id, orderPayload());
  await orderService.assignOrder(admin._id, order._id, captain._id);

  // assigned → delivered (تخطّى accepted/picked_up) يجب أن يُرفض
  await assert.rejects(
    () => orderService.updateOrderStatus(captain._id, order._id, ORDER_STATUS.DELIVERED),
    /انتقال غير مسموح/
  );
});

test('الإسناد التلقائي: يختار أقرب كابتن متاح', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser();
  // كابتن قريب عند نقطة الاستلام، وآخر بعيد
  const near = await makeCaptain(PICKUP);
  await makeCaptain([31.9, 30.9]); // بعيد

  const order = await orderService.createOrder(user._id, orderPayload());
  const res = await orderService.autoAssignOrder(order._id, { actorRole: 'system' });

  assert.equal(res.assigned, true);
  assert.equal(String(res.order.captain._id), String(near._id), 'اختار الأقرب');
});

test('الإلغاء: قبل الاستلام ينجح ويحرّر الكابتن', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const [user, captain, admin] = [await makeUser(), await makeCaptain(), await makeUser()];
  const order = await orderService.createOrder(user._id, orderPayload());
  await orderService.assignOrder(admin._id, order._id, captain._id);

  const cancelled = await orderService.cancelOrder(order._id, { actorId: user._id, actorRole: 'user' }, 'تغيّر رأيي');
  assert.equal(cancelled.status, ORDER_STATUS.CANCELLED);
  const freshCaptain = await Captain.findById(captain._id);
  assert.equal(freshCaptain.status, CAPTAIN_STATUS.ONLINE);
});

test('الإلغاء: بعد الاستلام مرفوض', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const [user, captain, admin] = [await makeUser(), await makeCaptain(), await makeUser()];
  const order = await orderService.createOrder(user._id, orderPayload());
  await orderService.assignOrder(admin._id, order._id, captain._id);
  await orderService.updateOrderStatus(captain._id, order._id, ORDER_STATUS.ACCEPTED);
  await orderService.updateOrderStatus(captain._id, order._id, ORDER_STATUS.PICKED_UP);

  await assert.rejects(
    () => orderService.cancelOrder(order._id, { actorId: user._id, actorRole: 'user' }),
    /لا يمكن إلغاء/
  );
});

test('تحوّل الكابتن لغير متصل: يُعيد طلبه غير المستَلم للمجمّع ويصبح offline (Card 16)', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const [user, captain, admin] = [await makeUser(), await makeCaptain(), await makeUser()];
  const order = await orderService.createOrder(user._id, orderPayload());
  await orderService.assignOrder(admin._id, order._id, captain._id);

  // الكابتن يحوّل حالته إلى "غير متصل" قبل قبول/استلام الطلب
  const updated = await orderService.setCaptainOffline(captain._id);

  assert.equal(updated.status, CAPTAIN_STATUS.OFFLINE, 'أصبح غير متصل');
  const freshCaptain = await Captain.findById(captain._id);
  assert.equal(freshCaptain.activeOrder, null, 'تحرّر من الطلب');

  const freshOrder = await require('../../src/models/Order').findById(order._id);
  assert.equal(freshOrder.status, ORDER_STATUS.PENDING, 'عاد الطلب للمجمّع لإعادة الإسناد');
  assert.equal(freshOrder.captain, null, 'لم يعد مُسنَدًا للكابتن السابق');
  assert.ok(
    freshOrder.rejectedBy.map(String).includes(String(captain._id)),
    'أُدرج الكابتن في قائمة الرفض فلا يُعاد إسناده إليه'
  );
});

test('تحوّل الكابتن لغير متصل بعد الاستلام: لا يمسّ الطلب الجاري (Card 16)', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const [user, captain, admin] = [await makeUser(), await makeCaptain(), await makeUser()];
  const order = await orderService.createOrder(user._id, orderPayload());
  await orderService.assignOrder(admin._id, order._id, captain._id);
  await orderService.updateOrderStatus(captain._id, order._id, ORDER_STATUS.ACCEPTED);
  await orderService.updateOrderStatus(captain._id, order._id, ORDER_STATUS.PICKED_UP);

  await orderService.setCaptainOffline(captain._id);

  const freshOrder = await require('../../src/models/Order').findById(order._id);
  assert.equal(freshOrder.status, ORDER_STATUS.PICKED_UP, 'الطلب الجاري بعد الاستلام لا يُلغى');
  assert.equal(String(freshOrder.captain), String(captain._id), 'يبقى مع الكابتن حتى التسليم');
});

test('التقييم: يحدّث متوسّط الكابتن ويمنع التكرار', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const [user, captain, admin] = [await makeUser(), await makeCaptain(), await makeUser()];
  const order = await orderService.createOrder(user._id, orderPayload());
  await orderService.assignOrder(admin._id, order._id, captain._id);
  await orderService.updateOrderStatus(captain._id, order._id, ORDER_STATUS.ACCEPTED);
  await orderService.updateOrderStatus(captain._id, order._id, ORDER_STATUS.PICKED_UP);
  await orderService.updateOrderStatus(
    captain._id, order._id, ORDER_STATUS.DELIVERED, '', order.deliveryCode, order.price
  );

  await orderService.rateOrder(user._id, order._id, 4);
  const rated = await Captain.findById(captain._id);
  assert.equal(rated.rating, 4, 'أوّل تقييم يصبح المتوسّط');
  assert.equal(rated.ratingsCount, 1);

  // تقييم ثانٍ لنفس الطلب مرفوض
  await assert.rejects(() => orderService.rateOrder(user._id, order._id, 5), /مسبقًا/);
});
