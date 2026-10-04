'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const Captain = require('../models/Captain');
const Merchant = require('../models/Merchant');
const { ROLES } = require('../utils/constants');

const ADMIN_ROLES = ['super_admin', 'operations', 'support', 'finance', 'marketing'];

function validAudience(aud) {
  if (Array.isArray(aud)) return aud.includes(env.jwtAudience);
  return aud === env.jwtAudience;
}

async function accountStillAllowed(payload) {
  if (!payload?.id || !payload?.role) return false;

  if (payload.role === ROLES.USER) {
    return Boolean(await User.exists({ _id: payload.id, role: ROLES.USER, isActive: true }));
  }
  if (payload.role === ROLES.CAPTAIN) {
    return Boolean(await Captain.exists({ _id: payload.id, isApproved: true }));
  }
  if (payload.role === ROLES.MERCHANT) {
    return Boolean(await Merchant.exists({ _id: payload.id, isActive: true }));
  }
  if (payload.role === ROLES.ADMIN) {
    return Boolean(await User.exists({
      _id: payload.id,
      role: ROLES.ADMIN,
      isActive: true,
      adminRole: { $in: ADMIN_ROLES },
    }));
  }

  // أي دور غير معروف يُرفض بدل المرور بشكل fail-open.
  return false;
}

// نقطة التحقق الواحدة المستخدمة من HTTP وSocket.io.
// نقبل مؤقتًا التوكنات القديمة التي لا تحمل iss/aud حتى تنتهي طبيعيًا، لكن إذا
// كانت claims موجودة فيجب أن تطابق القيم الرسمية.
async function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
  if (payload.iss !== undefined && payload.iss !== env.jwtIssuer) {
    throw new Error('invalid issuer');
  }
  if (payload.aud !== undefined && !validAudience(payload.aud)) {
    throw new Error('invalid audience');
  }
  if (!(await accountStillAllowed(payload))) {
    throw new Error('account unavailable');
  }
  return payload;
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'التوكن مفقود' });
  }

  try {
    req.auth = await verifyAccessToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ message: 'توكن غير صالح أو الحساب غير متاح' });
  }
}

function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.auth || !allowedRoles.includes(req.auth.role)) {
      return res.status(403).json({ message: 'غير مصرّح لك بهذا الإجراء' });
    }
    next();
  };
}

module.exports = { authenticate, authorize, verifyAccessToken, accountStillAllowed };
