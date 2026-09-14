'use strict';

// اختبارات تكامل للطلب من مطعم (Card 110) — تتخطّى نفسها بلا قاعدة بيانات.
//   npm run test:integration

const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after, beforeEach } = require('node:test');

const { connect, disconnect, clearDb, state } = require('./setup');

const User = require('../../src/models/User');
const Captain = require('../../src/models/Captain');
const Restaurant = require('../../src/models/Restaurant');
const MenuItem = require('../../src/models/MenuItem');
const Merchant = require('../../src/models/Merchant');
const restaurantService = require('../../src/services/restaurant.service');
const merchantService = require('../../src/services/merchant.service');
const orderService = require('../../src/services/order.service');
const adminWalletService = require('../../src/services/adminWallet.service');
const walletService = require('../../src/services/wallet.service');
const WalletTransaction = require('../../src/models/WalletTransaction');
const { ORDER_STATUS, CAPTAIN_STATUS } = require('../../src/utils/constants');

before(connect);
after(disconnect);
beforeEach(clearDb);

// عنوان تسليم داخل غزة (الإحداثيّات تُشتقّ من الحي)
const DROPOFF = { city: 'غزة', neighborhood: 'الرمال', street: 'شارع عمر المختار' };

async function makeUser() {
  const u = new User({ name: 'زبون', phone: `u${Date.now()}${Math.random()}` });
  await u.setPassword('secret1');
  await u.save();
  await walletService.creditWallet(u._id, 1000); // ليكفي رصيده أجرة التوصيل
  return u;
}

async function makeRestaurant(extra = {}) {
  return restaurantService.createRestaurant({
    name: 'مطعم يلا',
    category: 'مشاوي',
    city: 'غزة',
    neighborhood: 'النصر',
    phone: '0599000000',
    minOrder: 20,
    prepMinutes: 10,
    ...extra,
  });
}

async function makeCaptain() {
  const c = new Captain({
    name: 'كابتن المطعم',
    phone: `c${Date.now()}${Math.random()}`,
    status: CAPTAIN_STATUS.ONLINE,
    isApproved: true,
  });
  await c.setPassword('secret1');
  return c.save();
}

test('إنشاء مطعم: يشتقّ الإحداثيّات والعنوان من المدينة والحي', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const r = await makeRestaurant();
  assert.equal(r.address, 'غزة، النصر');
  assert.equal(r.location.coordinates.length, 2);
  assert.notEqual(r.location.coordinates[0], 0);
});

test('إنشاء مطعم: الحي يتغلّب على إحداثيّات الإدارة الخاطئة', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const r = await makeRestaurant({
    city: 'غزة',
    neighborhood: 'الرمال الجنوبي',
    location: { type: 'Point', coordinates: [0.1, 0.1] },
  });
  assert.deepEqual(r.location.coordinates, [34.44, 31.515]);
});

test('قائمة المطاعم: تُظهر المفعّلة فقط وتدعم الفلترة بالتصنيف', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  await makeRestaurant();
  await makeRestaurant({ name: 'حلويات يلا', category: 'حلويات' });
  await makeRestaurant({ name: 'مطعم معطّل', active: false });

  const all = await restaurantService.listRestaurants({});
  assert.equal(all.length, 2);

  const sweets = await restaurantService.listRestaurants({ category: 'حلويات' });
  assert.equal(sweets.length, 1);
  assert.equal(sweets[0].name, 'حلويات يلا');

  const searched = await restaurantService.listRestaurants({ q: 'حلويات' });
  assert.equal(searched.length, 1);
});

test('قائمة الطعام: تُعاد مجمّعة بالأقسام', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const r = await makeRestaurant();
  await restaurantService.createMenuItem(r._id, { name: 'شاورما', price: 15, category: 'ساندويشات' });
  await restaurantService.createMenuItem(r._id, { name: 'كولا', price: 5, category: 'مشروبات' });

  const { restaurant, menu } = await restaurantService.getRestaurantWithMenu(r._id);
  assert.equal(restaurant.name, 'مطعم يلا');
  assert.deepEqual(menu.map((g) => g.category).sort(), ['ساندويشات', 'مشروبات']);
});

test('طلب من مطعم: يُنشئ طلب توصيل استلامه من المطعم ويحفظ الأصناف بأسعار الخادم', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser();
  const r = await makeRestaurant();
  const shawarma = await restaurantService.createMenuItem(r._id, { name: 'شاورما', price: 15 });
  const cola = await restaurantService.createMenuItem(r._id, { name: 'كولا', price: 5 });

  const order = await restaurantService.createRestaurantOrder(user._id, {
    restaurantId: String(r._id),
    items: [
      { menuItemId: String(shawarma._id), qty: 2, price: 1 }, // سعر العميل يُتجاهل
      { menuItemId: String(cola._id), qty: 1 },
    ],
    dropoff: DROPOFF,
    note: 'بلا ثوم',
  });

  assert.equal(order.status, ORDER_STATUS.PENDING);
  assert.equal(order.pickup.neighborhood, 'النصر');
  assert.equal(order.pickup.contactName, 'مطعم يلا');
  assert.equal(order.dropoff.neighborhood, 'الرمال');
  assert.equal(order.store.name, 'مطعم يلا');
  assert.equal(order.store.items.length, 2);
  assert.equal(order.store.itemsTotal, 35); // 15×2 + 5
  assert.equal(order.store.note, 'بلا ثوم');
  assert.match(order.packageNote, /مطعم يلا/);
  assert.ok(order.price > 0); // أجرة التوصيل تُحسب كأي طلب
  assert.ok(order.etaMinutes >= 15); // يشمل زمن التحضير + هامش 5 دقائق
});

test('طلب من مطعم: يشترط رصيدًا يغطي الأصناف وأجرة التوصيل معًا', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser();
  const r = await makeRestaurant();
  const item = await restaurantService.createMenuItem(r._id, { name: 'وليمة', price: 995 });

  await assert.rejects(
    () => restaurantService.createRestaurantOrder(user._id, {
      restaurantId: String(r._id),
      items: [{ menuItemId: String(item._id), qty: 1 }],
      dropoff: DROPOFF,
    }),
    /المطلوب|رصيد محفظتك غير كافٍ/
  );
});

test('تسليم طلب المطعم: يخصم كامل الفاتورة ويوزّعها على محفظتي الكابتن والإدارة', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const [user, captain, admin] = [await makeUser(), await makeCaptain(), await makeUser()];
  const restaurant = await makeRestaurant();
  const item = await restaurantService.createMenuItem(restaurant._id, { name: 'وجبة', price: 40 });
  const before = (await walletService.getWalletSummary(user._id)).balance;
  const order = await restaurantService.createRestaurantOrder(user._id, {
    restaurantId: String(restaurant._id),
    items: [{ menuItemId: String(item._id), qty: 1 }],
    dropoff: DROPOFF,
  });

  await orderService.assignOrder(admin._id, order._id, captain._id);
  await orderService.updateOrderStatus(captain._id, order._id, ORDER_STATUS.ACCEPTED);
  await orderService.updateOrderStatus(captain._id, order._id, ORDER_STATUS.PICKED_UP);
  const delivered = await orderService.updateOrderStatus(
    captain._id, order._id, ORDER_STATUS.DELIVERED, '', order.deliveryCode, order.price
  );

  const after = (await walletService.getWalletSummary(user._id)).balance;
  assert.equal(before - after, 40 + order.price);
  assert.equal(delivered.captainNet, Math.round(order.price * 0.8));
  assert.equal(delivered.adminCredit, 40 + delivered.commission);
  const adminWallet = await adminWalletService.getWallet();
  assert.equal(adminWallet.balance, delivered.adminCredit);
  assert.equal(adminWallet.transactions.length, 1);

  // إعادة طلب التسليم (شبكة بطيئة/ضغط مكرر) لا تخصم أو تحول مرة ثانية.
  const repeated = await orderService.updateOrderStatus(
    captain._id, order._id, ORDER_STATUS.DELIVERED, '', order.deliveryCode, order.price
  );
  assert.equal(repeated.adminCredit, delivered.adminCredit);
  assert.equal((await walletService.getWalletSummary(user._id)).balance, after);
  assert.equal(await WalletTransaction.countDocuments({ idempotencyKey: `order-payment:${order._id}` }), 1);
});

test('إلغاء طلب متجر يعيد أي دفعة سابقة مرة واحدة ويسجل حركة الاسترداد', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser();
  const restaurant = await makeRestaurant({ minOrder: 0 });
  const item = await restaurantService.createMenuItem(restaurant._id, { name: 'طلب', price: 30 });
  const order = await restaurantService.createRestaurantOrder(user._id, {
    restaurantId: String(restaurant._id), items: [{ menuItemId: String(item._id), qty: 1 }], dropoff: DROPOFF,
  });
  const before = (await walletService.getWalletSummary(user._id)).balance;
  await walletService.chargeForOrder(user._id, 30 + order.price, order._id);
  assert.ok((await walletService.getWalletSummary(user._id)).balance < before);

  const cancelled = await orderService.cancelOrder(order._id, { actorId: user._id, actorRole: 'user' }, 'غيّرت رأيي');
  assert.equal(cancelled.refundAmount, 30 + order.price);
  assert.equal((await walletService.getWalletSummary(user._id)).balance, before);
  const duplicate = await walletService.refundOrderPayment(user._id, order._id, 'إعادة محاولة');
  assert.equal(duplicate.duplicate, true);
  assert.equal((await walletService.getWalletSummary(user._id)).balance, before);
});

test('طلب من مطعم: يصحّح موقعًا قديمًا فاسدًا من الحي قبل التسعير', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser();
  const r = await makeRestaurant({
    city: 'غزة',
    neighborhood: 'الرمال الجنوبي',
  });
  // نحاكي سجلًا قديمًا فاسدًا دخل قاعدة البيانات قبل إصلاح التطبيع.
  await Restaurant.findByIdAndUpdate(r._id, {
    location: { type: 'Point', coordinates: [0.1, 0.1] },
  });
  const item = await restaurantService.createMenuItem(r._id, {
    name: 'وجبة',
    price: 20,
  });

  const order = await restaurantService.createRestaurantOrder(user._id, {
    restaurantId: String(r._id),
    items: [{ menuItemId: String(item._id), qty: 1 }],
    dropoff: { city: 'غزة', neighborhood: 'تل الهوا' },
  });

  assert.deepEqual(order.pickup.location.coordinates, [34.44, 31.515]);
  assert.ok(order.distanceKm < 5, `المسافة غير منطقية: ${order.distanceKm}`);
  assert.ok(order.price <= 10, `السعر غير منطقي: ${order.price}`);
  assert.ok(order.etaMinutes < 60, `الوقت غير منطقي: ${order.etaMinutes}`);
});

test('طلب من مطعم: يُرفض تحت الحدّ الأدنى أو خارج ساعات العمل أو بسلّة فارغة', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser();
  const r = await makeRestaurant();
  const cola = await restaurantService.createMenuItem(r._id, { name: 'كولا', price: 5 });

  await assert.rejects(
    () =>
      restaurantService.createRestaurantOrder(user._id, {
        restaurantId: String(r._id),
        items: [{ menuItemId: String(cola._id), qty: 1 }], // 5 ₪ < الحدّ الأدنى 20
        dropoff: DROPOFF,
      }),
    /الحدّ الأدنى/
  );

  await assert.rejects(
    () =>
      restaurantService.createRestaurantOrder(user._id, {
        restaurantId: String(r._id),
        items: [],
        dropoff: DROPOFF,
      }),
    /السلّة فارغة/
  );

  await restaurantService.updateRestaurant(r._id, { openTime: '00:00', closeTime: '00:01' });
  await assert.rejects(
    () =>
      restaurantService.createRestaurantOrder(user._id, {
        restaurantId: String(r._id),
        items: [{ menuItemId: String(cola._id), qty: 10 }],
        dropoff: DROPOFF,
      }),
    /خارج مواعيد العمل/
  );
});

test('طلب من مطعم: يرفض صنفًا من مطعم آخر أو غير متاح', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser();
  const r1 = await makeRestaurant();
  const r2 = await makeRestaurant({ name: 'مطعم آخر' });
  const foreign = await restaurantService.createMenuItem(r2._id, { name: 'برجر', price: 30 });

  await assert.rejects(
    () =>
      restaurantService.createRestaurantOrder(user._id, {
        restaurantId: String(r1._id),
        items: [{ menuItemId: String(foreign._id), qty: 1 }],
        dropoff: DROPOFF,
      }),
    /لم تعد متاحة/
  );

  const off = await restaurantService.createMenuItem(r1._id, { name: 'كبة', price: 40 });
  await restaurantService.updateMenuItem(off._id, { available: false });
  await assert.rejects(
    () =>
      restaurantService.createRestaurantOrder(user._id, {
        restaurantId: String(r1._id),
        items: [{ menuItemId: String(off._id), qty: 1 }],
        dropoff: DROPOFF,
      }),
    /لم تعد متاحة/
  );
});

test('حذف مطعم: يحذف أصناف قائمته معه', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const r = await makeRestaurant();
  await restaurantService.createMenuItem(r._id, { name: 'فلافل', price: 3 });

  await restaurantService.deleteRestaurant(r._id);
  assert.equal(await Restaurant.countDocuments({}), 0);
  assert.equal(await MenuItem.countDocuments({}), 0);
});

test('حساب الشريك: يدير متجره فقط ويتابع مراحل تجهيز طلباته', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser();
  const ownRestaurant = await makeRestaurant({ name: 'متجر الشريك', minOrder: 0 });
  const otherRestaurant = await makeRestaurant({ name: 'متجر آخر', minOrder: 0 });
  const ownItem = await restaurantService.createMenuItem(ownRestaurant._id, { name: 'وجبة', price: 25 });
  const foreignItem = await restaurantService.createMenuItem(otherRestaurant._id, { name: 'صنف آخر', price: 10 });

  const account = await merchantService.upsertAdminMerchant(ownRestaurant._id, {
    name: 'صاحب المتجر',
    phone: '0599111222',
    password: 'secret1',
  });
  const merchant = await Merchant.findById(account.id);
  assert.equal(String(merchant.restaurant), String(ownRestaurant._id));

  await assert.rejects(
    () => merchantService.updateMenuItem(merchant._id, foreignItem._id, { price: 1 }),
    /الصنف غير موجود/
  );

  const order = await restaurantService.createRestaurantOrder(user._id, {
    restaurantId: String(ownRestaurant._id),
    items: [{ menuItemId: String(ownItem._id), qty: 1 }],
    dropoff: DROPOFF,
  });
  const accepted = await merchantService.updateOrderStatus(merchant._id, order._id, 'accepted');
  assert.equal(accepted.store.merchantStatus, 'accepted');
  const preparing = await merchantService.updateOrderStatus(merchant._id, order._id, 'preparing');
  assert.equal(preparing.store.merchantStatus, 'preparing');
  const ready = await merchantService.updateOrderStatus(merchant._id, order._id, 'ready');
  assert.equal(ready.store.merchantStatus, 'ready');

  await assert.rejects(
    () => merchantService.updateOrderStatus(merchant._id, order._id, 'accepted'),
    /انتقال غير مسموح/
  );
});
