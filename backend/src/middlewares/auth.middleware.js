'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const Captain = require('../models/Captain');
const Merchant = require('../models/Merchant');
const { ROLES } = require('../utils/constants');

function validAudience(aud) {
  if (Array.isArray(aud)) return aud.includes(env.jwtAudience);
  return aud === env.jwtAudience;
}

async function accountStillAllowed(payload) {
  if (!payload?.id || !payload?.role) return false;
  if (payload.role === ROLES.USER) {
    return Boolean(await User.exists({ _id: payload.id, isActive: true }));
  }
  if (payload.role === ROLES.CAPTAIN) {
    return Boolean(await Captain.exists({ _id: payload.id, isApproved: true }));
  }
  if (payload.role === ROLES.MERCHANT) {
    return Boolean(await Merchant.exists({ _id: payload.id, isActive: true }));
  }
  // حسابات الأدمن يُعاد التحقق منها مع adminRole في adminAccess middleware.
  // الأدوار الأخرى (مثل موظفي المتجر) لها middleware صلاحيات مستقل.
  return true;
}

// التحقق من توكن الـ JWT وإرفاق بيانات المستخدم بالطلب.
// نقبل مؤقتًا التوكنات القديمة التي لا تحمل iss/aud حتى تنتهي طبيعيًا خلال مدة JWT_EXPIRES_IN،
// لكن أي توكن جديد يحمل هذه claims ويجب أن تطابق القيم الرسمية.
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'التوكن مفقود' });
  }

  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    if (payload.iss !== undefined && payload.iss !== env.jwtIssuer) {
      return res.status(401).json({ message: 'توكن غير صالح' });
    }
    if (payload.aud !== undefined && !validAudience(payload.aud)) {
      return res.status(401).json({ message: 'توكن غير صالح' });
    }
    if (!(await accountStillAllowed(payload))) {
      return res.status(401).json({ message: 'الجلسة غير صالحة أو الحساب غير متاح' });
    }
    req.auth = payload;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'توكن غير صالح' });
  }
}

// السماح فقط للأدوار المحدّدة (مثال: authorize('admin'))
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.auth || !allowedRoles.includes(req.auth.role)) {
      return res.status(403).json({ message: 'غير مصرّح لك بهذا الإجراء' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
