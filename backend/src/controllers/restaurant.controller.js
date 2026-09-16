'use strict';

const restaurantService = require('../services/restaurant.service');
const merchantService = require('../services/merchant.service');
const featureService = require('../services/feature.service');
const Restaurant = require('../models/Restaurant');
const RestaurantRating = require('../models/RestaurantRating');

async function listRestaurants(req, res, next) {
  try { res.json(await restaurantService.listRestaurants(req.query)); } catch (err) { next(err); }
}
async function listCategories(req, res, next) {
  try { res.json(await restaurantService.listCategories()); } catch (err) { next(err); }
}
async function getRestaurant(req, res, next) {
  try { res.json(await restaurantService.getRestaurantWithMenu(req.params.restaurantId)); } catch (err) { next(err); }
}

async function rateRestaurant(req, res, next) {
  try {
    const stars = Number(req.body?.stars);
    if (!Number.isFinite(stars) || stars < 1 || stars > 5) return res.status(400).json({ message: 'التقييم يجب أن يكون من 1 إلى 5 نجوم' });
    const restaurant = await Restaurant.findById(req.params.restaurantId);
    if (!restaurant || !restaurant.active) return res.status(404).json({ message: 'المتجر غير موجود' });
    await RestaurantRating.findOneAndUpdate(
      { restaurant: restaurant._id, user: req.auth.id },
      { $set: { stars } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const [summary] = await RestaurantRating.aggregate([
      { $match: { restaurant: restaurant._id } },
      { $group: { _id: '$restaurant', ratingAverage: { $avg: '$stars' }, ratingCount: { $sum: 1 } } },
    ]);
    restaurant.ratingAverage = summary?.ratingAverage ?? 0;
    restaurant.ratingCount = summary?.ratingCount ?? 0;
    await restaurant.save();
    res.json({ ok: true, ratingAverage: restaurant.ratingAverage, ratingCount: restaurant.ratingCount, myRating: stars });
  } catch (err) { next(err); }
}

async function createRestaurantOrder(req, res, next) {
  try {
    const idempotencyKey = req.get('Idempotency-Key');
    const order = await restaurantService.createRestaurantOrder(req.auth.id, req.body, idempotencyKey);
    let coupon = null;
    const couponCode = String(req.body?.couponCode || '').trim();
    if (couponCode && order?.store?.restaurant) {
      const subtotal = Number(order.store.itemsTotal) || 0;
      const result = await featureService.validateCoupon(couponCode, subtotal, order.store.restaurant);
      if (result.valid && result.discount > 0) {
        order.store.itemsTotal = Math.max(0, Math.round((subtotal - result.discount) * 100) / 100);
        const discountNote = `كوبون ${result.code}: خصم ${result.discount} ₪`;
        order.store.note = [order.store.note, discountNote].filter(Boolean).join(' — ');
        await order.save();
        await featureService.consumeCoupon(result.coupon._id);
        coupon = { code: result.code, discount: result.discount, subtotal, totalAfterDiscount: order.store.itemsTotal };
      }
    }
    const body = typeof order.toObject === 'function' ? order.toObject() : order;
    res.status(201).json({ ...body, ...(coupon ? { coupon } : {}) });
  } catch (err) { next(err); }
}

async function adminListRestaurants(req, res, next) {
  try { res.json(await restaurantService.adminListRestaurants()); } catch (err) { next(err); }
}
async function createRestaurant(req, res, next) {
  try { res.status(201).json(await restaurantService.createRestaurant(req.body)); } catch (err) { next(err); }
}
async function updateRestaurant(req, res, next) {
  try { res.json(await restaurantService.updateRestaurant(req.params.restaurantId, req.body)); } catch (err) { next(err); }
}
async function deleteRestaurant(req, res, next) {
  try { res.json(await restaurantService.deleteRestaurant(req.params.restaurantId)); } catch (err) { next(err); }
}
async function uploadRestaurantImage(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'أرفق صورة' });
    const restaurant = await restaurantService.setRestaurantImage(req.params.restaurantId, req.file);
    res.json({ ok: true, imageUrl: restaurant.imageUrl, restaurant });
  } catch (err) { next(err); }
}
async function adminListMenu(req, res, next) {
  try { res.json(await restaurantService.adminListMenu(req.params.restaurantId)); } catch (err) { next(err); }
}
async function createMenuItem(req, res, next) {
  try { res.status(201).json(await restaurantService.createMenuItem(req.params.restaurantId, req.body)); } catch (err) { next(err); }
}
async function updateMenuItem(req, res, next) {
  try { res.json(await restaurantService.updateMenuItem(req.params.itemId, req.body)); } catch (err) { next(err); }
}
async function uploadMenuItemImage(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'أرفق صورة' });
    const item = await restaurantService.setMenuItemImage(req.params.itemId, req.file);
    res.json({ ok: true, imageUrl: item.imageUrl, item });
  } catch (err) { next(err); }
}
async function deleteMenuItem(req, res, next) {
  try { res.json(await restaurantService.deleteMenuItem(req.params.itemId)); } catch (err) { next(err); }
}
async function adminGetMerchant(req, res, next) {
  try { res.json(await merchantService.getAdminMerchant(req.params.restaurantId)); } catch (err) { next(err); }
}
async function adminUpsertMerchant(req, res, next) {
  try { res.json(await merchantService.upsertAdminMerchant(req.params.restaurantId, req.body)); } catch (err) { next(err); }
}

module.exports = {
  listRestaurants, listCategories, getRestaurant, rateRestaurant, createRestaurantOrder,
  adminListRestaurants, createRestaurant, updateRestaurant, deleteRestaurant, uploadRestaurantImage,
  adminListMenu, createMenuItem, updateMenuItem, deleteMenuItem, uploadMenuItemImage,
  adminGetMerchant, adminUpsertMerchant,
};
