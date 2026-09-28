'use strict';

const Order = require('../models/Order');
const Coupon = require('../models/Coupon');
const Restaurant = require('../models/Restaurant');
const MenuItem = require('../models/MenuItem');
const orderService = require('./order.service');
const inventoryService = require('./inventory.service');
const rewardsService = require('./rewards.service');
const walletHoldService = require('./walletHold.service');
const { coordsForNeighborhood } = require('../utils/neighborhoods');
const { ORDER_STATUS } = require('../utils/constants');
const {
  normalizeCartItems,
  buildOrderLines,
  summarizeCart,
  meetsMinOrder,
} = require('../utils/menu');

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

function restaurantCoordinates(restaurant = {}) {
  const byNeighborhood = coordsForNeighborhood(restaurant.neighborhood, restaurant.city);
  if (byNeighborhood) return byNeighborhood;
  const stored = restaurant.location?.coordinates;
  if (Array.isArray(stored) && stored.length === 2 && stored.every((n) => Number.isFinite(Number(n)))) {
    return stored.map(Number);
  }
  return [0, 0];
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

async function buildCart(restaurant, rawItems) {
  const cart = normalizeCartItems(rawItems);
  if (!cart.length) throw httpError('السلّة فارغة — اختر أصنافًا أولًا');
  const docs = await MenuItem.find({
    _id: { $in: cart.map((c) => c.menuItemId) },
    restaurant: restaurant._id,
  }).lean();
  const { lines, itemsTotal, missing } = buildOrderLines(docs, cart);
  if (missing.length || !lines.length) throw httpError('بعض الأصناف أو الخيارات لم تعد متاحة — حدّث السلّة');
  if (!meetsMinOrder(itemsTotal, restaurant.minOrder)) throw httpError(`الحد الأدنى للطلب من هذا المتجر ${restaurant.minOrder} ₪`);

  const wanted = new Map();
  for (const row of cart) wanted.set(String(row.menuItemId), (wanted.get(String(row.menuItemId)) || 0) + Number(row.qty || 1));
  for (const doc of docs) {
    const needed = wanted.get(String(doc._id)) || 0;
    if (doc.available === false) throw httpError(`الصنف «${doc.name}» غير متاح حاليًا`);
    if (doc.trackInventory && Number(doc.inventoryQty || 0) < needed) throw httpError(`الكمية المتوفرة من «${doc.name}» لا تكفي للطلب`);
  }
  return { docs, lines, originalTotal: itemsTotal, wanted };
}

async function placeRestaurantOrder(userId, payload = {}, idempotencyKey) {
  const restaurant = await Restaurant.findById(payload.restaurantId).lean();
  if (!restaurant || !restaurant.active) throw httpError('المتجر غير موجود', 404);

  let targetTime = new Date();
  if (payload.scheduledAt) {
    targetTime = new Date(payload.scheduledAt);
    if (Number.isNaN(targetTime.getTime())) throw httpError('موعد الطلب غير صالح');
    if (targetTime.getTime() < Date.now() + 20 * 60 * 1000) throw httpError('اختر موعدًا بعد 20 دقيقة على الأقل');
    if (targetTime.getTime() > Date.now() + 14 * 24 * 60 * 60 * 1000) throw httpError('يمكن جدولة الطلب خلال 14 يومًا فقط');
  }
  if (!scheduleOpen(restaurant, targetTime)) throw httpError(payload.scheduledAt ? 'المتجر مغلق في الموعد المختار' : 'المتجر مغلق حاليًا');

  const cartCtx = await buildCart(restaurant, payload.items);
  const couponInfo = await resolveCoupon(payload.couponCode, cartCtx.originalTotal, restaurant._id);
  const promoInfo = activePromotion(restaurant, cartCtx.originalTotal);
  const couponDiscount = couponInfo?.discount || 0;
  const promoDiscount = promoInfo?.discount || 0;
  const discount = Math.max(couponDiscount, promoDiscount);
  const discountedTotal = Math.max(0, Math.round((cartCtx.originalTotal - discount) * 100) / 100);
  const busy = !payload.scheduledAt && restaurant.busyUntil && new Date(restaurant.busyUntil) > new Date();
  const extraPrep = busy ? Math.max(0, Number(restaurant.busyExtraPrepMinutes) || 0) : 0;
  const prepMinutes = Math.max(0, Number(restaurant.prepMinutes) || 0) + extraPrep;
  const note = String(payload.note || '').trim();
  const pickupCoordinates = restaurantCoordinates(restaurant);

  const order = await orderService.createOrder(
    userId,
    {
      pickup: {
        address: restaurant.address || restaurant.name,
        city: restaurant.city,
        neighborhood: restaurant.neighborhood,
        street: restaurant.street,
        details: restaurant.name,
        note: '',
        contactName: restaurant.name,
        contactPhone: restaurant.phone || '',
        location: { type: 'Point', coordinates: pickupCoordinates },
      },
      dropoff: payload.dropoff,
      packageNote: summarizeCart(restaurant.name, cartCtx.lines, note),
      prepMinutes,
      scheduledAt: payload.scheduledAt,
      rewardPoints: payload.rewardPoints,
      store: {
        restaurant: restaurant._id,
        name: restaurant.name,
        prepMinutes,
        items: cartCtx.lines,
        itemsTotal: discountedTotal,
        itemsOriginalTotal: cartCtx.originalTotal,
        discount,
        couponCode: couponDiscount >= promoDiscount && couponInfo ? couponInfo.coupon.code : '',
        promotionTitle: promoDiscount > couponDiscount && promoInfo ? promoInfo.title : '',
        note,
      },
    },
    idempotencyKey
  );

  // Order model يحجز المبلغ قبل حفظ الطلب. إذا أعاد createOrder طلبًا سابقًا
  // بسبب Idempotency-Key فلا نخصم المخزون أو الكوبون مرة ثانية.
  if (order.$locals?.yallaCreatedNow === false) return order;

  let consumed = [];
  let inventoryCommitted = false;
  try {
    // الخصم ذري لكل صنف، ومع rollback تلقائي لما سبق خصمه إذا نفدت كمية أثناء السباق.
    consumed = await inventoryService.consumeInventory(cartCtx.docs, cartCtx.wanted);

    const committed = await Order.updateOne(
      { _id: order._id, inventoryCommitted: false },
      { $set: { inventoryCommitted: true, inventoryReleasedAt: null } }
    );
    if (committed.modifiedCount !== 1) {
      throw httpError('تعذّر تثبيت حجز مخزون الطلب — حاول مرة أخرى', 409);
    }
    inventoryCommitted = true;
    order.inventoryCommitted = true;

    // عدّاد الكوبون نفسه يحتاج شرطًا ذريًا حتى لا تتجاوز الطلبات المتزامنة usageLimit.
    if (couponInfo && couponDiscount >= promoDiscount) {
      const couponFilter = { _id: couponInfo.coupon._id, active: true };
      if (Number(couponInfo.coupon.usageLimit || 0) > 0) {
        couponFilter.$expr = { $lt: ['$usedCount', '$usageLimit'] };
      }
      const couponUpdate = await Coupon.updateOne(couponFilter, { $inc: { usedCount: 1 } });
      if (couponUpdate.modifiedCount !== 1) {
        throw httpError('تم استهلاك الكوبون قبل إتمام الطلب — أعد مراجعة السلة', 409);
      }
    }
  } catch (err) {
    if (inventoryCommitted) {
      await inventoryService.releaseOrderInventory(order._id).catch(() => {});
    } else if (consumed.length) {
      await inventoryService.restoreConsumed(consumed).catch(() => {});
    }

    await Order.updateOne(
      { _id: order._id, status: ORDER_STATUS.PENDING },
      {
        $set: {
          status: ORDER_STATUS.CANCELLED,
          cancelReason: 'تعذر تثبيت مخزون الطلب',
          'timeline.cancelledAt': new Date(),
          financialSettlementState: 'refunded',
        },
      }
    ).catch(() => {});
    await Promise.all([
      rewardsService.releaseReservation(userId, Number(order.rewardPointsUsed) || 0).catch(() => {}),
      walletHoldService.releaseOrderHold(order._id, 'commerce_finalize_failed').catch(() => {}),
    ]);
    throw err;
  }

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
        menuItemId: String(item.menuItem),
        qty: item.qty,
        note: item.note || '',
        variant: item.variant || '',
        options: item.options || [],
      })),
      dropoff: previous.dropoff,
      note: previous.store.note || '',
    },
    idempotencyKey
  );
}

module.exports = { placeRestaurantOrder, reorder };
