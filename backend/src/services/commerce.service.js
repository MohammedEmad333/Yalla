'use strict';

const Order = require('../models/Order');
const Coupon = require('../models/Coupon');
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const restaurantService = require('./restaurant.service');

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function discountFor(coupon, subtotal) {
  let discount = coupon.type === 'fixed'
    ? Number(coupon.value || 0)
    : subtotal * Number(coupon.value || 0) / 100;
  if (Number(coupon.maxDiscount || 0) > 0) discount = Math.min(discount, Number(coupon.maxDiscount));
  return Math.max(0, Math.min(subtotal, Math.round(discount * 100) / 100));
}

function parseTime(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function scheduleOpen(restaurant, at = new Date()) {
  if (restaurant.isOpen === false) return false;
  const weekly = Array.isArray(restaurant.weeklyHours) ? restaurant.weeklyHours : [];
  const row = weekly.find((x) => Number(x.day) === at.getDay());
  if (row?.closed) return false;
  const open = parseTime(row?.open || restaurant.openTime);
  const close = parseTime(row?.close || restaurant.closeTime);
  if (open == null || close == null || open === close) return true;
  const now = at.getHours() * 60 + at.getMinutes();
  return close > open ? now >= open && now < close : now >= open || now < close;
}

function activePromotion(restaurant, subtotal) {
  const promotion = restaurant.promotion || {};
  if (!promotion.active || Number(promotion.percent || 0) <= 0) return null;
  if (promotion.endsAt && new Date(promotion.endsAt) < new Date()) return null;
  if (subtotal < Number(promotion.minOrder || 0)) return null;
  const percent = Math.min(90, Math.max(0, Number(promotion.percent) || 0));
  const discount = Math.round((subtotal * percent / 100) * 100) / 100;
  return { title: String(promotion.title || 'عرض المتجر'), discount: Math.min(subtotal, discount) };
}

async function resolveCoupon(code, subtotal, restaurantId) {
  const normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return null;
  const coupon = await Coupon.findOne({ code: normalized, active: true });
  if (!coupon) throw httpError('الكوبون غير صالح');
  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) throw httpError('الكوبون لم يبدأ بعد');
  if (coupon.endsAt && coupon.endsAt < now) throw httpError('انتهت صلاحية الكوبون');
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) throw httpError('تم استهلاك الكوبون');
  if (coupon.restaurant && String(coupon.restaurant) !== String(restaurantId)) throw httpError('الكوبون غير متاح لهذا المتجر');
  if (subtotal < Number(coupon.minOrder || 0)) throw httpError(`الحد الأدنى لاستخدام الكوبون ${coupon.minOrder} ₪`);
  return { coupon, discount: discountFor(coupon, subtotal) };
}

async function inventoryContext(restaurantId, items = []) {
  const wanted = new Map();
  for (const raw of Array.isArray(items) ? items : []) {
    const id = String(raw.menuItemId || raw.menuItem || '');
    if (!id) continue;
    wanted.set(id, (wanted.get(id) || 0) + Math.max(1, Number(raw.qty) || 1));
  }
  const docs = await MenuItem.find({ _id: { $in: [...wanted.keys()] }, restaurant: restaurantId }).select('name available trackInventory inventoryQty').lean();
  for (const doc of docs) {
    const needed = wanted.get(String(doc._id)) || 0;
    if (doc.available === false) throw httpError(`الصنف «${doc.name}» غير متاح حاليًا`);
    if (doc.trackInventory && Number(doc.inventoryQty || 0) < needed) throw httpError(`الكمية المتوفرة من «${doc.name}» لا تكفي للطلب`);
  }
  return { wanted, docs };
}

async function consumeInventory(ctx) {
  const operations = ctx.docs
    .filter((doc) => doc.trackInventory)
    .map((doc) => ({
      updateOne: {
        filter: { _id: doc._id, inventoryQty: { $gte: ctx.wanted.get(String(doc._id)) || 0 } },
        update: { $inc: { inventoryQty: -(ctx.wanted.get(String(doc._id)) || 0) } },
      },
    }));
  if (operations.length) await MenuItem.bulkWrite(operations);
  await MenuItem.updateMany({ _id: { $in: ctx.docs.map((x) => x._id) }, trackInventory: true, inventoryQty: { $lte: 0 } }, { $set: { available: false, inventoryQty: 0 } });
}

async function placeRestaurantOrder(userId, payload = {}, idempotencyKey) {
  const restaurant = await Restaurant.findById(payload.restaurantId).lean();
  if (!restaurant || !restaurant.active) throw httpError('المتجر غير موجود', 404);
  const targetTime = payload.scheduledAt ? new Date(payload.scheduledAt) : new Date();
  if (!scheduleOpen(restaurant, targetTime)) throw httpError(payload.scheduledAt ? 'المتجر مغلق في الموعد المختار' : 'المتجر مغلق حاليًا');

  const inventory = await inventoryContext(restaurant._id, payload.items);
  const order = await restaurantService.createRestaurantOrder(userId, payload, idempotencyKey);
  const original = Number(order.store?.itemsTotal || 0);
  const couponInfo = await resolveCoupon(payload.couponCode, original, restaurant._id);
  const promoInfo = activePromotion(restaurant, original);

  const couponDiscount = couponInfo?.discount || 0;
  const promoDiscount = promoInfo?.discount || 0;
  const discount = Math.max(couponDiscount, promoDiscount);
  if (discount > 0) {
    order.store.itemsOriginalTotal = original;
    order.store.itemsTotal = Math.max(0, Math.round((original - discount) * 100) / 100);
    order.store.discount = discount;
    if (couponDiscount >= promoDiscount && couponInfo) order.store.couponCode = couponInfo.coupon.code;
    else if (promoInfo) order.store.promotionTitle = promoInfo.title;
  }

  const busy = restaurant.busyUntil && new Date(restaurant.busyUntil) > new Date();
  const extraPrep = busy ? Math.max(0, Number(restaurant.busyExtraPrepMinutes) || 0) : 0;
  order.store.prepMinutes = Math.max(0, Number(restaurant.prepMinutes) || 0) + extraPrep;
  if (extraPrep > 0) order.etaMinutes = Math.max(0, Number(order.etaMinutes) || 0) + extraPrep;
  await order.save();

  if (couponInfo && couponDiscount >= promoDiscount) {
    await Coupon.updateOne({ _id: couponInfo.coupon._id, active: true }, { $inc: { usedCount: 1 } });
  }
  await consumeInventory(inventory);
  return order;
}

async function reorder(userId, orderId, idempotencyKey) {
  const previous = await Order.findOne({ _id: orderId, user: userId }).lean();
  if (!previous) throw httpError('الطلب غير موجود', 404);
  if (!previous.store?.restaurant || !previous.store?.items?.length) throw httpError('إعادة الطلب متاحة لطلبات المتاجر فقط');
  return placeRestaurantOrder(
    userId,
    {
      restaurantId: String(previous.store.restaurant),
      items: previous.store.items.map((item) => ({
        menuItemId: String(item.menuItem), qty: item.qty, note: item.note || '', variant: item.variant || '', options: item.options || [],
      })),
      dropoff: previous.dropoff,
      note: previous.store.note || '',
    },
    idempotencyKey
  );
}

module.exports = { placeRestaurantOrder, reorder };
