'use strict';

const Order = require('../models/Order');
const Coupon = require('../models/Coupon');
const restaurantService = require('./restaurant.service');

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function discountFor(coupon, subtotal) {
  let discount = coupon.type === 'fixed'
    ? Number(coupon.value || 0)
    : subtotal * Number(coupon.value || 0) / 100;
  if (Number(coupon.maxDiscount || 0) > 0) {
    discount = Math.min(discount, Number(coupon.maxDiscount));
  }
  return Math.max(0, Math.min(subtotal, Math.round(discount * 100) / 100));
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
  if (coupon.restaurant && String(coupon.restaurant) !== String(restaurantId)) {
    throw httpError('الكوبون غير متاح لهذا المتجر');
  }
  if (subtotal < Number(coupon.minOrder || 0)) {
    throw httpError(`الحد الأدنى لاستخدام الكوبون ${coupon.minOrder} ₪`);
  }
  return { coupon, discount: discountFor(coupon, subtotal) };
}

async function placeRestaurantOrder(userId, payload = {}, idempotencyKey) {
  const order = await restaurantService.createRestaurantOrder(userId, payload, idempotencyKey);
  const couponInfo = await resolveCoupon(payload.couponCode, Number(order.store?.itemsTotal || 0), order.store?.restaurant);
  if (!couponInfo) return order;

  const original = Number(order.store.itemsTotal || 0);
  const discounted = Math.max(0, Math.round((original - couponInfo.discount) * 100) / 100);
  order.store.itemsTotal = discounted;
  order.store.itemsOriginalTotal = original;
  order.store.discount = couponInfo.discount;
  order.store.couponCode = couponInfo.coupon.code;
  await order.save();

  await Coupon.updateOne(
    { _id: couponInfo.coupon._id, active: true },
    { $inc: { usedCount: 1 } }
  );

  return order;
}

async function reorder(userId, orderId, idempotencyKey) {
  const previous = await Order.findOne({ _id: orderId, user: userId }).lean();
  if (!previous) throw httpError('الطلب غير موجود', 404);
  if (!previous.store?.restaurant || !previous.store?.items?.length) {
    throw httpError('إعادة الطلب متاحة لطلبات المتاجر فقط');
  }
  return restaurantService.createRestaurantOrder(
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
