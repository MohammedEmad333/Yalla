'use strict';

// اختبارات تكامل للطلب من مطعم (Card 110) — تتخطّى نفسها بلا قاعدة بيانات.
//   npm run test:integration

const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after, beforeEach } = require('node:test');

const { connect, disconnect, clearDb, state } = require('./setup');

const User = require('../../src/models/User');
const Restaurant = require('../../src/models/Restaurant');
const MenuItem = require('../../src/models/MenuItem');
const restaurantService = require('../../src/services/restaurant.service');
const walletService = require('../../src/services/wallet.service');
const { ORDER_STATUS } = require('../../src/utils/constants');

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
  assert.ok(order.etaMinutes >= 10); // يشمل زمن التحضير
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

test('طلب من مطعم: يُرفض تحت الحدّ الأدنى أو من مطعم مغلق أو بسلّة فارغة', async (t) => {
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

  await restaurantService.updateRestaurant(r._id, { isOpen: false });
  await assert.rejects(
    () =>
      restaurantService.createRestaurantOrder(user._id, {
        restaurantId: String(r._id),
        items: [{ menuItemId: String(cola._id), qty: 10 }],
        dropoff: DROPOFF,
      }),
    /مغلق/
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
