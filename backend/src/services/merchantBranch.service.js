'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const Merchant = require('../models/Merchant');
const Restaurant = require('../models/Restaurant');
const restaurantService = require('./restaurant.service');
const { ROLES } = require('../utils/constants');

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function branchIds(merchant) {
  const ids = [merchant.restaurant, ...(merchant.restaurants || [])]
    .filter(Boolean)
    .map(String);
  return [...new Set(ids)];
}

async function ownerMerchant(merchantId, auth = {}) {
  if (auth.staffRole && auth.staffRole !== 'owner') {
    throw httpError('إدارة الفروع متاحة لمالك الحساب فقط', 403);
  }
  const merchant = await Merchant.findById(merchantId);
  if (!merchant || !merchant.isActive) throw httpError('حساب الشريك غير متاح', 403);
  return merchant;
}

async function list(merchantId) {
  const merchant = await Merchant.findById(merchantId).lean();
  if (!merchant || !merchant.isActive) throw httpError('حساب الشريك غير متاح', 403);
  const ids = branchIds(merchant);
  const rows = await Restaurant.find({ _id: { $in: ids } })
    .select('name imageUrl category city neighborhood street address active isOpen prepMinutes')
    .sort({ createdAt: 1 })
    .lean();
  const activeId = String(merchant.activeRestaurant || merchant.restaurant || '');
  return rows.map((row) => ({ ...row, selected: String(row._id) === activeId }));
}

async function create(merchantId, auth, payload = {}) {
  const merchant = await ownerMerchant(merchantId, auth);
  const name = String(payload.name || '').trim();
  if (!name) throw httpError('اسم الفرع مطلوب');

  const restaurant = await restaurantService.createRestaurant({
    name,
    description: payload.description || '',
    category: payload.category || 'مطاعم',
    imageUrl: payload.imageUrl || '',
    phone: payload.phone || '',
    city: payload.city || '',
    neighborhood: payload.neighborhood || '',
    street: payload.street || '',
    address: payload.address || '',
    minOrder: payload.minOrder || 0,
    prepMinutes: payload.prepMinutes || 15,
    openTime: payload.openTime || '',
    closeTime: payload.closeTime || '',
    active: payload.active !== false,
  });

  merchant.restaurants = [...new Set([...(merchant.restaurants || []).map(String), String(restaurant._id)])];
  if (!merchant.activeRestaurant) merchant.activeRestaurant = merchant.restaurant;
  await merchant.save();
  return restaurant;
}

async function select(merchantId, auth, restaurantId) {
  const merchant = await ownerMerchant(merchantId, auth);
  const allowed = branchIds(merchant);
  if (!allowed.includes(String(restaurantId))) throw httpError('هذا الفرع غير تابع لحسابك', 403);
  const restaurant = await Restaurant.findOne({ _id: restaurantId, active: true })
    .select('name imageUrl category city neighborhood active')
    .lean();
  if (!restaurant) throw httpError('الفرع غير متاح', 404);

  merchant.activeRestaurant = restaurant._id;
  await merchant.save();
  const token = jwt.sign(
    {
      id: String(merchant._id),
      role: ROLES.MERCHANT,
      restaurantId: String(restaurant._id),
      staffRole: 'owner',
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
  return {
    token,
    user: {
      id: merchant._id,
      name: merchant.name,
      phone: merchant.phone,
      role: ROLES.MERCHANT,
      staffRole: 'owner',
      restaurant,
    },
  };
}

async function detach(merchantId, auth, restaurantId) {
  const merchant = await ownerMerchant(merchantId, auth);
  if (String(merchant.restaurant) === String(restaurantId)) {
    throw httpError('لا يمكن حذف الفرع الأساسي. غيّر الفرع الأساسي من الإدارة أولًا');
  }
  merchant.restaurants = (merchant.restaurants || []).filter((id) => String(id) !== String(restaurantId));
  if (String(merchant.activeRestaurant || '') === String(restaurantId)) merchant.activeRestaurant = merchant.restaurant;
  await merchant.save();
  return { ok: true };
}

module.exports = { list, create, select, detach, branchIds };
