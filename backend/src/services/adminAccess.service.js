'use strict';

const User = require('../models/User');
const Captain = require('../models/Captain');
const Merchant = require('../models/Merchant');
const MerchantStaff = require('../models/MerchantStaff');
const { normalizePhone } = require('../utils/phone');
const { ROLES } = require('../utils/constants');

const ADMIN_ROLES = ['super_admin', 'operations', 'support', 'finance', 'marketing'];
const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  operations: ['dashboard', 'orders', 'captains', 'users', 'restaurants', 'operations', 'stats', 'dispatch'],
  support: ['dashboard', 'support', 'chats', 'users:read', 'orders:read', 'issues'],
  finance: ['dashboard', 'finance', 'wallet', 'withdrawals', 'settlements', 'stats'],
  marketing: ['dashboard', 'marketing', 'broadcast', 'restaurants:read', 'stats:read'],
};

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function normalizeRole(value) {
  const role = String(value || '').trim();
  if (!ADMIN_ROLES.includes(role)) throw httpError('دور الإدارة غير صالح');
  return role;
}

async function listAdmins() {
  return User.find({ role: ROLES.ADMIN })
    .select('name lastName phone email adminRole regions isActive createdAt')
    .sort({ createdAt: 1 })
    .lean();
}

async function createAdmin(payload = {}) {
  const name = String(payload.name || '').trim();
  const phone = normalizePhone(payload.phone);
  const password = String(payload.password || '');
  const adminRole = normalizeRole(payload.adminRole || 'operations');
  if (!name) throw httpError('اسم الموظف مطلوب');
  if (!/^\+?\d{6,15}$/.test(phone)) throw httpError('رقم الجوال غير صالح');
  if (password.length < 6) throw httpError('كلمة السر ٦ أحرف على الأقل');
  const collisions = await Promise.all([
    User.exists({ phone }), Captain.exists({ phone }), Merchant.exists({ phone }), MerchantStaff.exists({ phone }),
  ]);
  if (collisions.some(Boolean)) throw httpError('رقم الجوال مستخدم في حساب آخر', 409);
  const user = new User({
    name,
    phone,
    role: ROLES.ADMIN,
    adminRole,
    regions: Array.isArray(payload.regions) ? payload.regions : [],
    isActive: true,
  });
  await user.setPassword(password);
  await user.save();
  return { id: user._id, name: user.name, phone: user.phone, adminRole: user.adminRole, regions: user.regions, isActive: user.isActive };
}

async function activeSuperAdminCount() {
  return User.countDocuments({
    role: ROLES.ADMIN,
    isActive: true,
    $or: [{ adminRole: 'super_admin' }, { adminRole: null }, { adminRole: { $exists: false } }],
  });
}

async function updateAdmin(requesterId, adminId, payload = {}) {
  const user = await User.findOne({ _id: adminId, role: ROLES.ADMIN }).select('+passwordHash');
  if (!user) throw httpError('حساب الإدارة غير موجود', 404);

  const currentRole = user.adminRole || 'super_admin';
  const requestedRole = payload.adminRole !== undefined ? normalizeRole(payload.adminRole) : currentRole;
  const disabling = payload.isActive === false && user.isActive !== false;
  const demotingSuper = currentRole === 'super_admin' && requestedRole !== 'super_admin';

  if (String(user._id) === String(requesterId) && disabling) {
    throw httpError('لا يمكنك تعطيل حسابك الحالي');
  }
  if (String(user._id) === String(requesterId) && demotingSuper) {
    throw httpError('لا يمكنك إزالة صلاحية Super Admin من حسابك الحالي');
  }
  if ((disabling || demotingSuper) && currentRole === 'super_admin' && await activeSuperAdminCount() <= 1) {
    throw httpError('يجب أن يبقى حساب Super Admin فعّال واحد على الأقل');
  }

  if (payload.name !== undefined) user.name = String(payload.name || '').trim();
  if (payload.adminRole !== undefined) user.adminRole = requestedRole;
  if (payload.regions !== undefined) user.regions = Array.isArray(payload.regions) ? payload.regions : [];
  if (payload.isActive !== undefined) user.isActive = !!payload.isActive;
  if (payload.password) {
    const password = String(payload.password);
    if (password.length < 6) throw httpError('كلمة السر ٦ أحرف على الأقل');
    await user.setPassword(password);
  }
  await user.save();
  return { id: user._id, name: user.name, phone: user.phone, adminRole: user.adminRole || 'super_admin', regions: user.regions, isActive: user.isActive };
}

async function accessInfo(adminId) {
  const user = await User.findOne({ _id: adminId, role: ROLES.ADMIN })
    .select('name phone adminRole regions isActive')
    .lean();
  if (!user || !user.isActive) throw httpError('حساب الإدارة غير متاح', 403);
  const role = user.adminRole || 'super_admin';
  return { adminRole: role, permissions: ROLE_PERMISSIONS[role] || [], regions: user.regions || [] };
}

module.exports = { ADMIN_ROLES, ROLE_PERMISSIONS, listAdmins, createAdmin, updateAdmin, accessInfo };
