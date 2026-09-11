'use strict';

const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const orderService = require('./order.service');
const { saveImage, deleteFileByUrl } = require('../utils/avatarStore');
const { isOpenBySchedule } = require('../utils/restaurantHours');
const { composeAddress } = require('../utils/address');
const { coordsForNeighborhood } = require('../utils/neighborhoods');
const {
  normalizeCartItems,
  buildOrderLines,
  summarizeCart,
  groupMenuByCategory,
  meetsMinOrder,
} = require('../utils/menu');

/**
 * خدمة المطاعم (Card 110): تصفّح المطاعم وقوائمها، وإنشاء طلب من مطعم مباشرةً.
 * الطلب الناتج طلب توصيل عادي (نفس دورة الحياة والإسناد والتتبّع) لكنّ نقطة
 * استلامه هي المطعم، ويحمل أصناف السلّة وأسعارها لحظة الطلب.
 */

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

/**
 * موقع المطعم مصدره المدينة والحي، لا الإحداثيّات القديمة المحفوظة.
 * بعض السجلات القديمة تحتوي إحداثيّات معكوسة/بعيدة جدًا رغم أن الحي صحيح؛
 * لذلك نعتمد مركز الحي متى كان معروفًا، ونرجع للموقع المحفوظ للتوافق فقط.
 */
function restaurantCoordinates(restaurant = {}) {
  const fromNeighborhood = coordsForNeighborhood(
    restaurant.neighborhood,
    restaurant.city
  );
  if (fromNeighborhood) return fromNeighborhood;

  const stored = restaurant.location?.coordinates;
  if (
    Array.isArray(stored) &&
    stored.length === 2 &&
    stored.every((n) => Number.isFinite(Number(n)))
  ) {
    return stored.map(Number);
  }
  return [0, 0];
}

function withNeighborhoodLocation(restaurant) {
  if (!restaurant) return restaurant;
  const coordinates = restaurantCoordinates(restaurant);
  return {
    ...restaurant,
    location: { type: 'Point', coordinates },
  };
}

// الحقول المُعادة للزبون (نُخفي حقول الإدارة غير الضرورية)
const PUBLIC_FIELDS =
  'name description category imageUrl phone city neighborhood street address location minOrder prepMinutes isOpen openTime closeTime sortOrder';

// يطبّع وقتًا إلى صيغة "HH:MM" (٢٤ ساعة) أو '' إن كان فارغًا/غير صالح.
function normalizeTime(value) {
  const s = (value ?? '').toString().trim();
  if (!s) return '';
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '';
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * تطبيع مدخلات المطعم القادمة من لوحة الأدمن: تركيب العنوان الموحّد واشتقاق
 * الإحداثيّات من (المدينة + الحي) إن لم تُرسل صراحةً.
 * @param {object} payload
 * @returns {object} حقول جاهزة للحفظ
 */
function normalizeRestaurantPayload(payload = {}) {
  const city = (payload.city || '').toString().trim();
  const neighborhood = (payload.neighborhood || '').toString().trim();
  const street = (payload.street || '').toString().trim();

  const doc = {
    ...(payload.name !== undefined ? { name: (payload.name || '').toString().trim() } : {}),
    ...(payload.description !== undefined
      ? { description: (payload.description || '').toString().trim() }
      : {}),
    ...(payload.category !== undefined
      ? { category: (payload.category || '').toString().trim() || 'مطاعم' }
      : {}),
    ...(payload.imageUrl !== undefined ? { imageUrl: (payload.imageUrl || '').toString().trim() } : {}),
    ...(payload.phone !== undefined ? { phone: (payload.phone || '').toString().trim() } : {}),
    ...(payload.minOrder !== undefined ? { minOrder: Math.max(0, Number(payload.minOrder) || 0) } : {}),
    ...(payload.prepMinutes !== undefined
      ? { prepMinutes: Math.max(0, Number(payload.prepMinutes) || 0) }
      : {}),
    ...(payload.isOpen !== undefined ? { isOpen: !!payload.isOpen } : {}),
    ...(payload.openTime !== undefined ? { openTime: normalizeTime(payload.openTime) } : {}),
    ...(payload.closeTime !== undefined ? { closeTime: normalizeTime(payload.closeTime) } : {}),
    ...(payload.active !== undefined ? { active: !!payload.active } : {}),
    ...(payload.sortOrder !== undefined ? { sortOrder: Number(payload.sortOrder) || 0 } : {}),
  };

  if (payload.city !== undefined) doc.city = city;
  if (payload.neighborhood !== undefined) doc.neighborhood = neighborhood;
  if (payload.street !== undefined) doc.street = street;

  if (city || neighborhood || street) {
    doc.address =
      (payload.address || '').toString().trim() || composeAddress({ city, neighborhood, street });
  } else if (payload.address !== undefined) {
    doc.address = (payload.address || '').toString().trim();
  }

  // عند وجود حي معروف فهو مصدر الحقيقة. هذا يصلح تلقائيًا أي إحداثيّات قديمة
  // أو معكوسة أرسلها نموذج الإدارة.
  const sent = payload.location?.coordinates;
  if (neighborhood) {
    const coords = coordsForNeighborhood(neighborhood, city);
    if (coords) doc.location = { type: 'Point', coordinates: coords };
  } else if (
    Array.isArray(sent) &&
    sent.length === 2 &&
    sent.every((n) => Number.isFinite(Number(n)))
  ) {
    doc.location = { type: 'Point', coordinates: sent.map(Number) };
  }

  return doc;
}

/**
 * قائمة المطاعم الظاهرة للزبائن مع فلترة اختيارية.
 * @param {{city?:string, category?:string, q?:string, limit?:number}} query
 */
async function listRestaurants(query = {}) {
  const filter = { active: true };

  const city = (query.city || '').toString().trim();
  if (city) filter.city = city;

  const category = (query.category || '').toString().trim();
  if (category && category !== 'الكل') filter.category = category;

  const q = (query.q || '').toString().trim();
  if (q) {
    // نستفيد من فهرس MongoDB النصّي الموجود على name/description بدل مسح
    // كل المطاعم بتعبير RegExp غير مفهرس في كل عملية بحث.
    filter.$text = { $search: q };
  }

  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 60));

  const restaurants = await Restaurant.find(filter)
    .select(PUBLIC_FIELDS)
    .sort({ isOpen: -1, sortOrder: 1, name: 1 })
    .limit(limit)
    .lean();
  return restaurants.map(withNeighborhoodLocation);
}

/** تصنيفات المطاعم المتاحة فعليًّا (لعرضها كرقائق فلترة في التطبيق). */
async function listCategories() {
  const values = await Restaurant.distinct('category', { active: true });
  return values.filter(Boolean).sort();
}

/** مطعم واحد + قائمته مجمّعة بالأقسام. */
async function getRestaurantWithMenu(restaurantId) {
  const restaurant = await Restaurant.findOne({ _id: restaurantId, active: true })
    .select(PUBLIC_FIELDS)
    .lean()
    .catch(() => null);
  if (!restaurant) throw httpError('المطعم غير موجود', 404);

  const items = await MenuItem.find({ restaurant: restaurantId })
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  return {
    restaurant: withNeighborhoodLocation(restaurant),
    menu: groupMenuByCategory(items),
    items,
  };
}

/**
 * إنشاء طلب من مطعم (Card 110).
 * نقطة الاستلام = عنوان المطعم وإحداثيّاته، ونقطة التسليم = عنوان الزبون.
 * الأسعار تُقرأ من قاعدة البيانات (لا من العميل)، ثمّ نفوّض الإنشاء لخدمة الطلبات
 * لتبقى دورة الحياة (تسعير التوصيل، المحفظة، الإسناد، التتبّع) موحّدة.
 *
 * @param {string} userId
 * @param {{restaurantId:string, items:Array, dropoff:object, note?:string, scheduledAt?:string}} payload
 * @param {string} [idempotencyKey]
 */
async function createRestaurantOrder(userId, payload = {}, idempotencyKey) {
  const restaurant = await Restaurant.findById(payload.restaurantId).catch(() => null);
  if (!restaurant || !restaurant.active) throw httpError('المطعم غير موجود', 404);
  if (!restaurant.isOpen) throw httpError('المطعم مغلق حاليًا — جرّب لاحقًا', 400);
  if (!isOpenBySchedule(restaurant.openTime, restaurant.closeTime)) {
    throw httpError('المطعم خارج مواعيد العمل حاليًا — جرّب لاحقًا', 400);
  }

  const cart = normalizeCartItems(payload.items);
  if (cart.length === 0) throw httpError('السلّة فارغة — اختر أصنافًا أولًا', 400);

  const docs = await MenuItem.find({
    _id: { $in: cart.map((c) => c.menuItemId) },
    restaurant: restaurant._id,
  }).lean();

  const { lines, itemsTotal, missing } = buildOrderLines(docs, cart);
  if (missing.length || lines.length === 0) {
    throw httpError('بعض الأصناف لم تعد متاحة — حدّث السلّة', 400);
  }
  if (!meetsMinOrder(itemsTotal, restaurant.minOrder)) {
    throw httpError(`الحدّ الأدنى للطلب من هذا المطعم ${restaurant.minOrder} ₪`, 400);
  }

  const note = (payload.note || '').toString().trim();

  // نقطة الاستلام = المطعم. المدينة والحي هما مصدر الإحداثيّات حتى لا تؤدي
  // إحداثيّات قديمة فاسدة إلى سعر ووقت وصول غير منطقيين.
  const pickupCoordinates = restaurantCoordinates(restaurant);
  const pickup = {
    address: restaurant.address || restaurant.name,
    city: restaurant.city,
    neighborhood: restaurant.neighborhood,
    street: restaurant.street,
    details: restaurant.name,
    note: '',
    contactName: restaurant.name,
    contactPhone: restaurant.phone || '',
    location: {
      type: 'Point',
      coordinates: pickupCoordinates,
    },
  };

  return orderService.createOrder(
    userId,
    {
      pickup,
      dropoff: payload.dropoff,
      packageNote: summarizeCart(restaurant.name, lines, note),
      prepMinutes: restaurant.prepMinutes,
      scheduledAt: payload.scheduledAt,
      store: {
        restaurant: restaurant._id,
        name: restaurant.name,
        items: lines,
        itemsTotal,
        note,
      },
    },
    idempotencyKey
  );
}

// ── إدارة (أدمن) ────────────────────────────────────────────────────────────

/** كل المطاعم (بما فيها المعطّلة) للوحة الأدمن. */
async function adminListRestaurants() {
  return Restaurant.find({}).sort({ sortOrder: 1, name: 1 }).lean();
}

async function createRestaurant(payload = {}) {
  const doc = normalizeRestaurantPayload(payload);
  if (!doc.name) throw httpError('اسم المطعم مطلوب', 400);
  return Restaurant.create(doc);
}

async function updateRestaurant(restaurantId, payload = {}) {
  const doc = normalizeRestaurantPayload(payload);
  const updated = await Restaurant.findByIdAndUpdate(restaurantId, doc, { new: true }).catch(
    () => null
  );
  if (!updated) throw httpError('المطعم غير موجود', 404);
  return updated;
}

/** حذف مطعم مع كلّ أصناف قائمته (الطلبات السابقة تحتفظ بنسختها من الأصناف). */
async function deleteRestaurant(restaurantId) {
  const deleted = await Restaurant.findByIdAndDelete(restaurantId).catch(() => null);
  if (!deleted) throw httpError('المطعم غير موجود', 404);
  // تنظيف صور الأصناف والغلاف المخزّنة في قاعدة البيانات قبل حذف الأصناف
  const items = await MenuItem.find({ restaurant: restaurantId }).select('imageUrl').lean();
  await Promise.all([
    deleteFileByUrl(deleted.imageUrl),
    ...items.map((it) => deleteFileByUrl(it.imageUrl)),
  ]);
  await MenuItem.deleteMany({ restaurant: restaurantId });
  return { message: 'تم حذف المطعم وقائمته' };
}

/**
 * رفع صورة غلاف للمطعم من الجهاز (Card 111): تُخزَّن في قاعدة البيانات (FileAsset)
 * لتبقى دائمة على استضافة Oracle، ويُحدَّث imageUrl إلى الرابط الثابت /files/<id>،
 * مع حذف الصورة القديمة إن كانت مخزّنة عندنا (لا نحذف الروابط الخارجية http).
 * @param {string} restaurantId
 * @param {object} file ملفّ multer (memoryStorage)
 */
async function setRestaurantImage(restaurantId, file) {
  if (!file) throw httpError('أرفق صورة', 400);
  const restaurant = await Restaurant.findById(restaurantId).catch(() => null);
  if (!restaurant) throw httpError('المطعم غير موجود', 404);

  const url = await saveImage(file, {
    kind: 'restaurant',
    owner: restaurant._id,
    ownerRole: 'restaurant',
  });
  const previous = restaurant.imageUrl;
  restaurant.imageUrl = url;
  await restaurant.save();
  await deleteFileByUrl(previous);
  return restaurant;
}

/**
 * رفع صورة لصنف من الجهاز (Card 111) — نفس منطق صورة المطعم.
 * @param {string} itemId
 * @param {object} file ملفّ multer (memoryStorage)
 */
async function setMenuItemImage(itemId, file) {
  if (!file) throw httpError('أرفق صورة', 400);
  const item = await MenuItem.findById(itemId).catch(() => null);
  if (!item) throw httpError('الصنف غير موجود', 404);

  const url = await saveImage(file, {
    kind: 'menu-item',
    owner: item._id,
    ownerRole: 'menu-item',
  });
  const previous = item.imageUrl;
  item.imageUrl = url;
  await item.save();
  await deleteFileByUrl(previous);
  return item;
}

/** أصناف قائمة مطعم (للوحة الأدمن — تشمل غير المتاحة). */
async function adminListMenu(restaurantId) {
  return MenuItem.find({ restaurant: restaurantId }).sort({ sortOrder: 1, name: 1 }).lean();
}

function normalizeMenuPayload(payload = {}) {
  const doc = {};
  if (payload.name !== undefined) doc.name = (payload.name || '').toString().trim();
  if (payload.description !== undefined)
    doc.description = (payload.description || '').toString().trim();
  if (payload.category !== undefined) doc.category = (payload.category || '').toString().trim();
  if (payload.imageUrl !== undefined) doc.imageUrl = (payload.imageUrl || '').toString().trim();
  if (payload.price !== undefined) doc.price = Math.max(0, Number(payload.price) || 0);
  if (payload.available !== undefined) doc.available = !!payload.available;
  if (payload.sortOrder !== undefined) doc.sortOrder = Number(payload.sortOrder) || 0;
  return doc;
}

async function createMenuItem(restaurantId, payload = {}) {
  const restaurant = await Restaurant.findById(restaurantId).catch(() => null);
  if (!restaurant) throw httpError('المطعم غير موجود', 404);

  const doc = normalizeMenuPayload(payload);
  if (!doc.name) throw httpError('اسم الصنف مطلوب', 400);
  if (!(doc.price > 0)) throw httpError('سعر الصنف مطلوب', 400);

  return MenuItem.create({ ...doc, restaurant: restaurantId });
}

async function updateMenuItem(itemId, payload = {}) {
  const updated = await MenuItem.findByIdAndUpdate(itemId, normalizeMenuPayload(payload), {
    new: true,
  }).catch(() => null);
  if (!updated) throw httpError('الصنف غير موجود', 404);
  return updated;
}

async function deleteMenuItem(itemId) {
  const deleted = await MenuItem.findByIdAndDelete(itemId).catch(() => null);
  if (!deleted) throw httpError('الصنف غير موجود', 404);
  await deleteFileByUrl(deleted.imageUrl);
  return { message: 'تم حذف الصنف' };
}

module.exports = {
  listRestaurants,
  listCategories,
  getRestaurantWithMenu,
  createRestaurantOrder,
  adminListRestaurants,
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
  setRestaurantImage,
  adminListMenu,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  setMenuItemImage,
  normalizeRestaurantPayload,
};
