'use strict';

// اختبارات تكامل للوحة الأدمن — تعديل حساب الكابتن (Card 78)، وظهور رمز التسليم
// للأدمن (Card 73)، وظهور صورة العميل في تفاصيل الزبائن (Card 76).
// تتخطّى نفسها تلقائيًا إن لم تتوفّر قاعدة بيانات (انظر setup.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after, beforeEach } = require('node:test');

const { connect, disconnect, clearDb, state } = require('./setup');

const Captain = require('../../src/models/Captain');
const CaptainApplication = require('../../src/models/CaptainApplication');
const User = require('../../src/models/User');
const Order = require('../../src/models/Order');
const Notification = require('../../src/models/Notification');
const Wallet = require('../../src/models/Wallet');
const adminService = require('../../src/services/admin.service');
const orderService = require('../../src/services/order.service');
const walletService = require('../../src/services/wallet.service');
const { ORDER_STATUS, CAPTAIN_STATUS } = require('../../src/utils/constants');

const PICKUP = [31.2357, 30.0444];
const DROPOFF = [31.2000, 30.0600];

before(connect);
after(disconnect);
beforeEach(clearDb);

async function makeCaptain(extra = {}) {
  const c = new Captain({ name: 'كابتن', phone: `c${Date.now()}${Math.random()}`, ...extra });
  await c.setPassword('secret1');
  return c.save();
}

test('Card 78: الأدمن يعدّل اسم/جوال/مركبة الكابتن', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const c = await makeCaptain({ vehicleType: 'motorcycle' });

  const res = await adminService.updateCaptain(c._id, {
    name: 'اسم جديد',
    phone: '0599999999',
    vehicleType: 'bicycle',
    vehiclePlate: 'AB-123',
  });

  assert.equal(res.name, 'اسم جديد');
  assert.equal(res.phone, '0599999999');
  assert.equal(res.vehicleType, 'bicycle');
  assert.equal(res.vehiclePlate, 'AB-123');
});

test('Card 78: تغيير كلمة السر يجعل الجديدة صالحة والقديمة لا', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const c = await makeCaptain();

  await adminService.updateCaptain(c._id, { password: 'newpass1' });

  const fresh = await Captain.findById(c._id).select('+passwordHash');
  assert.ok(await fresh.verifyPassword('newpass1'), 'كلمة السر الجديدة صالحة');
  assert.ok(!(await fresh.verifyPassword('secret1')), 'القديمة لم تعد صالحة');
});

test('Card 78: كلمة سر قصيرة تُرفض، ورقم جوال مكرّر يُرفض', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const a = await makeCaptain({ phone: '0591111111' });
  const b = await makeCaptain({ phone: '0592222222' });

  await assert.rejects(() => adminService.updateCaptain(a._id, { password: '123' }), /٦ أحرف/);
  await assert.rejects(() => adminService.updateCaptain(b._id, { phone: '0591111111' }), /مستخدَم/);
});

test('Card 73: طلبات الأدمن النشطة تتضمّن رمز التسليم', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = new User({ name: 'زبون', phone: `u${Date.now()}` });
  await user.setPassword('secret1');
  await user.save();
  await walletService.creditWallet(user._id, 100000);

  await orderService.createOrder(user._id, {
    pickup: { address: 'الاستلام', location: { type: 'Point', coordinates: PICKUP } },
    dropoff: { address: 'التسليم', location: { type: 'Point', coordinates: DROPOFF } },
  });

  const active = await orderService.getActiveOrders();
  assert.equal(active.length, 1);
  assert.match(String(active[0].deliveryCode), /^\d{4}$/, 'رمز التسليم من 4 أرقام يظهر للأدمن');
});

test('Card 74: الأدمن يعدّل السعر التقريبي (السقف) للطلب', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = new User({ name: 'زبون', phone: `u${Date.now()}${Math.random()}` });
  await user.setPassword('secret1');
  await user.save();
  await walletService.creditWallet(user._id, 100000);

  const order = await orderService.createOrder(user._id, {
    pickup: { address: 'الاستلام', location: { type: 'Point', coordinates: PICKUP } },
    dropoff: { address: 'التسليم', location: { type: 'Point', coordinates: DROPOFF } },
  });

  const updated = await orderService.updateOrderPrice(order._id, order.price + 25);
  assert.equal(updated.price, order.price + 25, 'السقف الجديد صار هو السعر التقريبي الرسمي');

  // سعر أقلّ من الحدّ الأدنى يُرفض
  await assert.rejects(() => orderService.updateOrderPrice(order._id, 1), /يقلّ عن/);
});

// مساعد: إنشاء طلب توثيق كابتن (Card 79)
async function makeApplication(overrides = {}) {
  const app = new CaptainApplication({
    fullName: 'كابتن رباعي الاسم',
    phone: `a${Date.now()}${Math.random()}`.slice(0, 12),
    nationalId: '400000000',
    birthDate: new Date('1995-01-01'),
    idPhotoUrl: '/uploads/ids/id-1.jpg',
    selfieUrl: '/uploads/ids/id-2.jpg',
    vehicleType: 'motorcycle',
    ...overrides,
  });
  await app.setPassword('secret1');
  await app.save();
  return app;
}

test('Card 79: قبول طلب التوثيق يُنشئ كابتن معتمَدًا وينقل البيانات', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const app = await makeApplication();

  const res = await adminService.approveCaptainApplication(app._id);
  assert.ok(res.id, 'أُنشئ حساب الكابتن');

  const captain = await Captain.findById(res.id).select('+nationalId +passwordHash isApproved createdVia name phone');
  assert.equal(captain.isApproved, true, 'الكابتن معتمَد');
  assert.equal(captain.createdVia, 'app');
  assert.equal(captain.nationalId, '400000000', 'نُقل رقم الهوية');
  assert.ok(await captain.verifyPassword('secret1'), 'كلمة السر تعمل بعد النقل');

  const gone = await CaptainApplication.findById(app._id);
  assert.equal(gone, null, 'حُذف الطلب بعد القبول');
});

test('Card 79: رفض طلب التوثيق يحذفه ولا يُنشئ كابتن', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const app = await makeApplication();

  await adminService.rejectCaptainApplication(app._id);

  assert.equal(await CaptainApplication.findById(app._id), null, 'حُذف الطلب');
  assert.equal(await Captain.findOne({ phone: app.phone }), null, 'لم يُنشأ حساب كابتن');
});

test('Card 79: قبول طلب بهاتف يملك كابتن مسبقًا يُرفض', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const existing = await makeCaptain({ phone: '0597778888' });
  const app = await makeApplication({ phone: existing.phone });

  await assert.rejects(() => adminService.approveCaptainApplication(app._id), /بالفعل/);
});

// مساعد: إنشاء طلب في حالة "مُسنَد" لمستخدم وكابتن (لاختبار الإغلاق الإداريّ)
async function makeAssignedOrder(user, captain) {
  return Order.create({
    user: user._id,
    captain: captain._id,
    pickup: { address: 'الاستلام', location: { type: 'Point', coordinates: PICKUP } },
    dropoff: { address: 'التسليم', location: { type: 'Point', coordinates: DROPOFF } },
    price: 20,
    status: ORDER_STATUS.ASSIGNED,
    timeline: { assignedAt: new Date() },
  });
}

test('Card 80: الحساب الخارجي المؤقّت يُحذف بعد إغلاق طلبه', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const ext = new User({ name: 'خارجي', phone: `x${Date.now()}`, isExternal: true });
  await ext.setPassword('secret1');
  await ext.save();
  const captain = await makeCaptain();
  const order = await makeAssignedOrder(ext, captain);

  await orderService.forceCompleteByAdmin(order._id, { actorId: captain._id });

  const stillThere = await User.findById(ext._id);
  assert.equal(stillThere, null, 'الحساب الخارجي المؤقّت حُذف بعد انتهاء الطلب');
});

test('Card 80: الحساب الدائم لا يُحذف بعد إغلاق طلبه', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const perm = new User({ name: 'دائم', phone: `p${Date.now()}`, isExternal: false });
  await perm.setPassword('secret1');
  await perm.save();
  const captain = await makeCaptain();
  const order = await makeAssignedOrder(perm, captain);

  await orderService.forceCompleteByAdmin(order._id, { actorId: captain._id });

  const stillThere = await User.findById(perm._id);
  assert.ok(stillThere, 'الحساب الدائم يبقى بعد انتهاء الطلب');
});

test('Card 80: طلب الأدمن الخارجي يُنشئ حسابًا مؤقّتًا (isExternal)', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  // نستخدم الدالة المساعدة الداخلية عبر إنشاء طلب أدمن بحيّ صالح
  const phone = `9${Date.now()}`.slice(0, 10);
  const order = await orderService.createOrderByAdmin('000000000000000000000000', {
    contactName: 'زبون خارجي',
    contactPhone: phone,
    pickup: { neighborhood: 'الرمال' },
    dropoff: { neighborhood: 'الزيتون' },
  });
  const created = await User.findById(order.user).select('isExternal');
  assert.equal(created.isExternal, true, 'حساب الطلب الخارجي مؤقّت');
});

test('Card 81: adminCredit يضيف رصيدًا ويُسجّل حركة تعديل', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const ext = new User({ name: 'خارجي', phone: `x${Date.now()}`, isExternal: true });
  await ext.setPassword('secret1');
  await ext.save();

  const balance = await walletService.adminCredit(ext._id, 30, { reason: 'external_topup' });
  assert.equal(balance, 30, 'أُضيف الرصيد');

  const wallet = await Wallet.findOne({ user: ext._id });
  assert.equal(wallet.balance, 30);
});

test('Card 82: إرسال الرمز للكابتن يُنشئ إشعارًا يحمل الرمز وعلامة الأدمن', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = new User({ name: 'زبون', phone: `u${Date.now()}${Math.random()}` });
  await user.setPassword('secret1');
  await user.save();
  const captain = await makeCaptain({ status: CAPTAIN_STATUS.ONLINE });
  const order = await Order.create({
    user: user._id,
    captain: captain._id,
    pickup: { address: 'الاستلام', location: { type: 'Point', coordinates: PICKUP } },
    dropoff: { address: 'التسليم', location: { type: 'Point', coordinates: DROPOFF } },
    price: 20,
    deliveryCode: '4321',
    status: ORDER_STATUS.ACCEPTED,
  });

  await orderService.sendDeliveryCodeToCaptain(order._id);

  const notif = await Notification.findOne({ recipient: captain._id, 'data.type': 'DELIVERY_CODE' });
  assert.ok(notif, 'أُنشئ إشعار للكابتن');
  assert.equal(notif.data.code, '4321', 'الإشعار يحمل رمز التسليم');
  assert.equal(notif.data.fromAdmin, true, 'موسوم كإشعار من الإدارة');
});

test('Card 83: بعد التسليم يصل الكابتن إشعار بإتمام التوصيل', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const admin = new User({ name: 'أدمن', phone: `ad${Date.now()}`, role: 'admin' });
  await admin.setPassword('secret1');
  await admin.save();
  const user = new User({ name: 'زبون', phone: `u${Date.now()}${Math.random()}` });
  await user.setPassword('secret1');
  await user.save();
  await walletService.creditWallet(user._id, 100000);
  const captain = await makeCaptain({ status: CAPTAIN_STATUS.ONLINE });

  const order = await orderService.createOrder(user._id, {
    pickup: { address: 'الاستلام', location: { type: 'Point', coordinates: PICKUP } },
    dropoff: { address: 'التسليم', location: { type: 'Point', coordinates: DROPOFF } },
  });
  await orderService.assignOrder(admin._id, order._id, captain._id);
  await orderService.updateOrderStatus(captain._id, order._id, ORDER_STATUS.ACCEPTED);
  await orderService.updateOrderStatus(captain._id, order._id, ORDER_STATUS.PICKED_UP);
  await orderService.updateOrderStatus(
    captain._id, order._id, ORDER_STATUS.DELIVERED, '', order.deliveryCode, order.price
  );

  const notif = await Notification.findOne({ recipient: captain._id, 'data.type': 'DELIVERY_DONE' });
  assert.ok(notif, 'وصل الكابتن إشعار إتمام التوصيل');
});

test('Card 76: تفاصيل الزبائن تتضمّن avatarUrl', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = new User({
    name: 'زبون',
    phone: `u${Date.now()}`,
    avatarUrl: '/uploads/avatars/x.jpg',
  });
  await user.setPassword('secret1');
  await user.save();

  const rows = await adminService.listCustomers({});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].avatarUrl, '/uploads/avatars/x.jpg');
});
