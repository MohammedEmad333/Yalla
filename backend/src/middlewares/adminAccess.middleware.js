'use strict';

const User = require('../models/User');

function classify(req) {
  const path = req.path || '';
  const method = req.method || 'GET';
  if (path.startsWith('/support')) return 'support';
  if (path.startsWith('/chats')) return 'chats';
  if (path.startsWith('/notifications')) return 'broadcast';
  if (path.startsWith('/wallet') || path.startsWith('/withdrawals') || path.startsWith('/customer-withdrawals')) return 'finance';
  if (/^\/users\/[^/]+\/wallet/.test(path)) return 'finance';
  if (/^\/captains\/[^/]+\/(wallet|settle)/.test(path)) return 'finance';
  if (path.startsWith('/menu-items')) return 'restaurants';
  if (path.startsWith('/restaurants')) return method === 'GET' ? 'restaurants:read' : 'restaurants';
  if (path.startsWith('/orders')) return method === 'GET' ? 'orders:read' : 'orders';
  if (path.startsWith('/users') || path.startsWith('/customers')) return method === 'GET' ? 'users:read' : 'users';
  if (path.startsWith('/captains') || path.startsWith('/captain-applications')) return 'captains';
  if (path.startsWith('/stats') || path.startsWith('/user-counts')) return method === 'GET' ? 'stats:read' : 'stats';
  if (path.startsWith('/settings')) return 'operations';
  if (path.startsWith('/account')) return 'dashboard';
  return 'dashboard';
}

const ROLE_RULES = {
  super_admin: () => true,
  operations: (p) => ['dashboard','orders','orders:read','captains','users','users:read','restaurants','restaurants:read','operations','stats','stats:read','dispatch'].includes(p),
  support: (p) => ['dashboard','support','chats','users:read','orders:read','issues'].includes(p),
  finance: (p) => ['dashboard','finance','stats:read','settlements'].includes(p),
  marketing: (p) => ['dashboard','broadcast','restaurants:read','stats:read','marketing'].includes(p),
};

async function resolveAdmin(req) {
  if (!req.auth || req.auth.role !== 'admin') return null;
  const admin = await User.findById(req.auth.id).select('adminRole isActive');
  if (!admin || !admin.isActive) return null;
  const role = admin.adminRole || 'super_admin';
  req.auth.adminRole = role;
  return { admin, role };
}

async function enforceAdminAccess(req, res, next) {
  try {
    const ctx = await resolveAdmin(req);
    if (!ctx) return res.status(403).json({ message: 'حساب الإدارة غير متاح' });
    const permission = classify(req);
    const allowed = ROLE_RULES[ctx.role]?.(permission) === true;
    if (!allowed) return res.status(403).json({ message: 'ليس لديك صلاحية لهذا القسم', adminRole: ctx.role, permission });
    next();
  } catch (err) { next(err); }
}

function requireAdminCapability(capability) {
  return async (req, res, next) => {
    try {
      const ctx = await resolveAdmin(req);
      if (!ctx) return res.status(403).json({ message: 'حساب الإدارة غير متاح' });
      if (ROLE_RULES[ctx.role]?.(capability) !== true) {
        return res.status(403).json({ message: 'ليس لديك صلاحية لهذا الإجراء', adminRole: ctx.role, permission: capability });
      }
      next();
    } catch (err) { next(err); }
  };
}

function requireSuperAdmin(req, res, next) {
  if (req.auth?.adminRole !== 'super_admin') return res.status(403).json({ message: 'هذا الإجراء متاح لـ Super Admin فقط' });
  next();
}

module.exports = { enforceAdminAccess, requireAdminCapability, requireSuperAdmin, ROLE_RULES };
