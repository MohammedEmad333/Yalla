'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const Merchant = require('../models/Merchant');
const MerchantStaff = require('../models/MerchantStaff');
const Restaurant = require('../models/Restaurant');
const User = require('../models/User');
const Captain = require('../models/Captain');
const { normalizePhone } = require('../utils/phone');
const { ROLES } = require('../utils/constants');

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function signToken(id, extra = {}) {
  return jwt.sign({ id, role: ROLES.MERCHANT, ...extra }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

function branchIds(merchant) {
  return [...new Set([merchant.restaurant, ...(merchant.restaurants || [])].filter(Boolean).map(String))];
}

async function login(phoneRaw, passwordRaw) {
  const phone = normalizePhone(phoneRaw);
  const password = String(passwordRaw || '');
  if (!/^\+?\d{6,15}$/.test(phone) || !password) throw httpError('أدخل رقم الجوال وكلمة السر', 400);

  const merchant = await Merchant.findOne({ phone }).select('+passwordHash');
  if (merchant) {
    if (!(await merchant.verifyPassword(password))) throw httpError('كلمة السر غير صحيحة', 401);
    if (!merchant.isActive) throw httpError('حساب المتجر غير متاح', 403);
    const selectedId = merchant.activeRestaurant || merchant.restaurant;
    const restaurant = await Restaurant.findById(selectedId).select('name imageUrl active city neighborhood');
    if (!restaurant || restaurant.active === false) throw httpError('الفرع المحدد غير متاح', 403);
    return {
      token: signToken(merchant._id, { restaurantId: String(restaurant._id), staffRole: 'owner' }),
      user: {
        id: merchant._id,
        name: merchant.name,
        phone: merchant.phone,
        role: ROLES.MERCHANT,
        staffRole: 'owner',
        restaurant,
        branchCount: branchIds(merchant).length,
      },
    };
  }

  const staff = await MerchantStaff.findOne({ phone }).select('+passwordHash').populate('restaurant', 'name imageUrl active city neighborhood');
  if (!staff) throw httpError('لا يوجد حساب متجر بهذا الرقم', 401);
  if (!(await staff.verifyPassword(password))) throw httpError('كلمة السر غير صحيحة', 401);
  if (!staff.active || !staff.restaurant || staff.restaurant.active === false) throw httpError('حساب الموظف غير متاح', 403);
  const owner = await Merchant.findById(staff.merchant);
  if (!owner || !owner.isActive) throw httpError('حساب المتجر غير متاح', 403);
  if (!branchIds(owner).includes(String(staff.restaurant._id))) throw httpError('لم يعد هذا الفرع تابعًا للحساب', 403);
  return {
    token: signToken(owner._id, { restaurantId: String(staff.restaurant._id), staffRole: staff.role, staffId: String(staff._id) }),
    user: { id: owner._id, staffId: staff._id, name: staff.name, phone: staff.phone, role: ROLES.MERCHANT, staffRole: staff.role, restaurant: staff.restaurant },
  };
}

async function requireOwner(merchantId, auth = {}) {
  if (auth.staffRole && auth.staffRole !== 'owner') throw httpError('هذا الإجراء متاح لمالك المتجر فقط', 403);
  const merchant = await Merchant.findById(merchantId);
  if (!merchant || !merchant.isActive) throw httpError('حساب المتجر غير متاح', 403);
  return merchant;
}

async function list(merchantId, auth = {}) {
  const filter = { merchant: merchantId };
  if (auth.restaurantId) filter.restaurant = auth.restaurantId;
  return MerchantStaff.find(filter).select('-passwordHash').sort({ createdAt: 1 }).lean();
}

async function create(merchantId, auth, payload = {}) {
  const merchant = await requireOwner(merchantId, auth);
  const name = String(payload.name || '').trim();
  const phone = normalizePhone(payload.phone);
  const password = String(payload.password || '');
  const role = payload.role === 'manager' ? 'manager' : 'cashier';
  const restaurantId = auth.restaurantId || merchant.activeRestaurant || merchant.restaurant;
  if (!branchIds(merchant).includes(String(restaurantId))) throw httpError('الفرع غير تابع للحساب', 403);
  if (!name) throw httpError('اسم الموظف مطلوب');
  if (!/^\+?\d{6,15}$/.test(phone)) throw httpError('رقم الجوال غير صالح');
  if (password.length < 6) throw httpError('كلمة السر ٦ أحرف على الأقل');

  const collisions = await Promise.all([
    User.exists({ phone }), Captain.exists({ phone }), Merchant.exists({ phone }), MerchantStaff.exists({ phone }),
  ]);
  if (collisions.some(Boolean)) throw httpError('رقم الجوال مستخدم في حساب آخر', 409);

  const staff = new MerchantStaff({ merchant: merchant._id, restaurant: restaurantId, name, phone, role, active: true });
  await staff.setPassword(password);
  await staff.save();
  return { id: staff._id, name: staff.name, phone: staff.phone, role: staff.role, active: staff.active, restaurant: staff.restaurant };
}

async function update(merchantId, auth, staffId, payload = {}) {
  await requireOwner(merchantId, auth);
  const filter = { _id: staffId, merchant: merchantId };
  if (auth.restaurantId) filter.restaurant = auth.restaurantId;
  const staff = await MerchantStaff.findOne(filter).select('+passwordHash');
  if (!staff) throw httpError('الموظف غير موجود في الفرع الحالي', 404);
  if (payload.name !== undefined) staff.name = String(payload.name || '').trim();
  if (payload.role !== undefined) staff.role = payload.role === 'manager' ? 'manager' : 'cashier';
  if (payload.active !== undefined) staff.active = !!payload.active;
  if (payload.password) {
    const password = String(payload.password);
    if (password.length < 6) throw httpError('كلمة السر ٦ أحرف على الأقل');
    await staff.setPassword(password);
  }
  await staff.save();
  return { id: staff._id, name: staff.name, phone: staff.phone, role: staff.role, active: staff.active, restaurant: staff.restaurant };
}

async function remove(merchantId, auth, staffId) {
  await requireOwner(merchantId, auth);
  const filter = { _id: staffId, merchant: merchantId };
  if (auth.restaurantId) filter.restaurant = auth.restaurantId;
  const row = await MerchantStaff.findOneAndDelete(filter);
  if (!row) throw httpError('الموظف غير موجود في الفرع الحالي', 404);
  return { ok: true };
}

module.exports = { login, list, create, update, remove };
