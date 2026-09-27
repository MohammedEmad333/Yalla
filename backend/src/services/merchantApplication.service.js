'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const Merchant = require('../models/Merchant');
const MerchantStaff = require('../models/MerchantStaff');
const Restaurant = require('../models/Restaurant');
const User = require('../models/User');
const Captain = require('../models/Captain');
const restaurantService = require('./restaurant.service');
const { normalizePhone } = require('../utils/phone');
const { ROLES } = require('../utils/constants');

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function signToken(merchant, restaurantId) {
  return jwt.sign(
    {
      id: String(merchant._id),
      role: ROLES.MERCHANT,
      restaurantId: String(restaurantId),
      staffRole: 'owner',
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

function restaurantSummary(restaurant) {
  if (!restaurant) return null;
  return {
    _id: restaurant._id,
    name: restaurant.name,
    imageUrl: restaurant.imageUrl || '',
    category: restaurant.category || 'مطاعم',
    city: restaurant.city || '',
    neighborhood: restaurant.neighborhood || '',
    address: restaurant.address || '',
    active: restaurant.active !== false,
    approvalStatus: restaurant.approvalStatus || 'approved',
    approvalRejectionReason: restaurant.approvalRejectionReason || '',
  };
}

async function register(payload = {}) {
  const name = String(payload.name || '').trim();
  const phone = normalizePhone(payload.phone);
  const password = String(payload.password || '');
  const storeName = String(payload.storeName || payload.restaurantName || '').trim();

  if (!name) throw httpError('اسم صاحب المتجر مطلوب');
  if (!/^\+?\d{6,15}$/.test(phone)) throw httpError('أدخل رقم جوال صحيح');
  if (password.length < 6) throw httpError('كلمة السر ٦ أحرف على الأقل');
  if (!storeName) throw httpError('اسم المتجر مطلوب');

  const collisions = await Promise.all([
    User.exists({ phone }),
    Captain.exists({ phone }),
    Merchant.exists({ phone }),
    MerchantStaff.exists({ phone }),
  ]);
  if (collisions.some(Boolean)) throw httpError('رقم الجوال مستخدم في حساب آخر', 409);

  const normalized = restaurantService.normalizeRestaurantPayload({
    name: storeName,
    description: payload.description || '',
    category: payload.category || 'مطاعم',
    phone: payload.storePhone || phone,
    city: payload.city || '',
    neighborhood: payload.neighborhood || '',
    street: payload.street || '',
    address: payload.address || '',
    minOrder: payload.minOrder || 0,
    prepMinutes: payload.prepMinutes || 15,
    active: false,
  });

  let restaurant;
  try {
    restaurant = await Restaurant.create({
      ...normalized,
      active: false,
      isOpen: false,
      approvalStatus: 'pending',
      approvalSource: 'self_service',
      approvalRejectionReason: '',
      submittedAt: new Date(),
      reviewedAt: null,
    });

    const merchant = new Merchant({
      name,
      phone,
      restaurant: restaurant._id,
      restaurants: [],
      activeRestaurant: restaurant._id,
      organizationName: String(payload.organizationName || storeName).trim(),
      isActive: true,
      applicationStatus: 'pending',
      applicationRejectionReason: '',
    });
    await merchant.setPassword(password);
    await merchant.save();

    return {
      token: signToken(merchant, restaurant._id),
      user: {
        id: merchant._id,
        name: merchant.name,
        phone: merchant.phone,
        role: ROLES.MERCHANT,
        staffRole: 'owner',
        applicationStatus: merchant.applicationStatus,
        applicationRejectionReason: '',
        restaurant: restaurantSummary(restaurant),
      },
      message: 'تم إنشاء الحساب وإرسال المتجر للمراجعة.',
    };
  } catch (err) {
    if (restaurant?._id) await Restaurant.deleteOne({ _id: restaurant._id }).catch(() => {});
    throw err;
  }
}

async function getStatus(merchantId) {
  const merchant = await Merchant.findById(merchantId).lean();
  if (!merchant || !merchant.isActive) throw httpError('حساب المتجر غير متاح', 404);
  const restaurant = await Restaurant.findById(merchant.restaurant).lean();
  return {
    id: merchant._id,
    name: merchant.name,
    phone: merchant.phone,
    role: ROLES.MERCHANT,
    staffRole: 'owner',
    applicationStatus: merchant.applicationStatus || 'approved',
    applicationRejectionReason: merchant.applicationRejectionReason || '',
    restaurant: restaurantSummary(restaurant),
  };
}

async function listAdmin({ status = 'pending' } = {}) {
  const filter = {};
  if (status && status !== 'all') filter.approvalStatus = status;
  const restaurants = await Restaurant.find(filter)
    .sort({ submittedAt: -1, createdAt: -1 })
    .lean();

  const ids = restaurants.map((row) => row._id);
  const merchants = ids.length
    ? await Merchant.find({
        $or: [
          { restaurant: { $in: ids } },
          { restaurants: { $in: ids } },
        ],
      }).lean()
    : [];

  return restaurants.map((restaurant) => {
    const merchant = merchants.find((m) =>
      String(m.restaurant) === String(restaurant._id) ||
      (m.restaurants || []).some((id) => String(id) === String(restaurant._id))
    );
    const primary = merchant && String(merchant.restaurant) === String(restaurant._id);
    return {
      id: String(restaurant._id),
      restaurantId: String(restaurant._id),
      merchantId: merchant ? String(merchant._id) : null,
      ownerName: merchant?.name || '',
      ownerPhone: merchant?.phone || '',
      organizationName: merchant?.organizationName || '',
      isPrimary: !!primary,
      name: restaurant.name,
      category: restaurant.category,
      phone: restaurant.phone,
      city: restaurant.city,
      neighborhood: restaurant.neighborhood,
      street: restaurant.street,
      address: restaurant.address,
      description: restaurant.description,
      approvalStatus: restaurant.approvalStatus || 'approved',
      rejectionReason: restaurant.approvalRejectionReason || '',
      submittedAt: restaurant.submittedAt || restaurant.createdAt,
      reviewedAt: restaurant.reviewedAt || null,
    };
  });
}

async function ownerForRestaurant(restaurantId) {
  return Merchant.findOne({
    $or: [{ restaurant: restaurantId }, { restaurants: restaurantId }],
  });
}

async function approve(restaurantId) {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw httpError('المتجر غير موجود', 404);

  restaurant.approvalStatus = 'approved';
  restaurant.approvalRejectionReason = '';
  restaurant.reviewedAt = new Date();
  restaurant.active = true;
  restaurant.isOpen = true;
  await restaurant.save();

  const merchant = await ownerForRestaurant(restaurant._id);
  if (merchant && String(merchant.restaurant) === String(restaurant._id)) {
    merchant.applicationStatus = 'approved';
    merchant.applicationRejectionReason = '';
    if (!merchant.activeRestaurant) merchant.activeRestaurant = restaurant._id;
    await merchant.save();
  }

  return {
    ok: true,
    restaurant: restaurantSummary(restaurant),
    merchantId: merchant?._id || null,
  };
}

async function reject(restaurantId, reasonRaw = '') {
  const reason = String(reasonRaw || '').trim();
  if (!reason) throw httpError('اكتب سبب الرفض');

  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw httpError('المتجر غير موجود', 404);

  restaurant.approvalStatus = 'rejected';
  restaurant.approvalRejectionReason = reason;
  restaurant.reviewedAt = new Date();
  restaurant.active = false;
  restaurant.isOpen = false;
  await restaurant.save();

  const merchant = await ownerForRestaurant(restaurant._id);
  if (merchant && String(merchant.restaurant) === String(restaurant._id)) {
    merchant.applicationStatus = 'rejected';
    merchant.applicationRejectionReason = reason;
    await merchant.save();
  }

  return {
    ok: true,
    restaurant: restaurantSummary(restaurant),
    merchantId: merchant?._id || null,
  };
}

module.exports = { register, getStatus, listAdmin, approve, reject };
