'use strict';

const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const orderService = require('./order.service');
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

// الحقول المُعادة للزبون (نُخفي حقول الإدارة غير الضرورية)
const PUBLIC_FIELDS =
  'name description category imageUrl phone city neighborhood street address location minOrder prepMinutes isOpen sortOrder';

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

  // الإحداثيّات: من العميل إن أُرسلت صالحة، وإلّا من الحي المختار
  const sent = payload.location?.coordinates;
  if (Array.isArray(sent) && sent.length === 2 && sent.every((n) => typeof n === 'number')) {
    doc.location = { type: 'Point', coordinates: sent };
  } else if (neighborhood) {
    const coords = coordsForNeighborhood(neighborhood, city);
    if (coords) doc.location = { type: 'Point', coordinates: coords };
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
    // بحث بسيط بالاسم/الوصف (نهرب الرموز الخاصّة لتفادي تعبير نمطي غير صالح)
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ name: new RegExp(safe, 'i') }, { description: new RegExp(safe, 'i') }];
  }

  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 60));

  return Restaurant.find(filter)
    .select(PUBLIC_FIELDS)
    .sort({ isOpen: -1, sortOrder: 1, name: 1 })
    .limit(limit)
    .lean();
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

  return { restaurant, menu: groupMenuByCategory(items), items };
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

  // نقطة الاستلام = المطعم (عنوانه وإحداثيّاته المحفوظة)
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
      coordinates: restaurant.location?.coordinates || [0, 0],
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
  await MenuItem.deleteMany({ restaurant: restaurantId });
  return { message: 'تم حذف المطعم وقائمته' };
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
  adminListMenu,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  normalizeRestaurantPayload,
};
