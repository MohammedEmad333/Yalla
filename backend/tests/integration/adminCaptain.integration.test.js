'use strict';

// اختبارات تكامل للوحة الأدمن — تعديل حساب الكابتن (Card 78)، وظهور رمز التسليم
// للأدمن (Card 73)، وظهور صورة العميل في تفاصيل الزبائن (Card 76).
// تتخطّى نفسها تلقائيًا إن لم تتوفّر قاعدة بيانات (انظر setup.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after, beforeEach } = require('node:test');

const { connect, disconnect, clearDb, state } = require('./setup');

const Captain = require('../../src/models/Captain');
const User = require('../../src/models/User');
const Order = require('../../src/models/Order');
const adminService = require('../../src/services/admin.service');
const orderService = require('../../src/services/order.service');
const walletService = require('../../src/services/wallet.service');
const { ORDER_STATUS } = require('../../src/utils/constants');

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
