'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const Captain = require('../models/Captain');
const Merchant = require('../models/Merchant');
const { ROLES } = require('../utils/constants');
const {
  ADMIN_SESSION_SENTINEL,
  getAdminSessionTokenFromCookieHeader,
} = require('../utils/adminSession');

const ADMIN_ROLES = ['super_admin', 'operations', 'support', 'finance', 'marketing'];

// سياسة issuer/audience أصبحت جزءًا من إصدار JWT قبل هذا التاريخ. نسمح مؤقتًا
// فقط بالتوكن القديم الذي لا يحمل أيًّا من الحقلين وكان قد صدر قبل اكتمال
// الترحيل. هذه التوكنات تنتهي طبيعيًا خلال JWT_EXPIRES_IN (7d افتراضيًا)،
// وبعدها لا يمكن لتوكن جديد بلا claims المرور حتى لو بقي مسار توافق قديم.
const LEGACY_CLAIMLESS_ISSUED_BEFORE = Math.floor(Date.parse('2026-10-06T00:00:00Z') / 1000);

function validAudience(aud) {
  if (Array.isArray(aud)) return aud.includes(env.jwtAudience);
  return aud === env.jwtAudience;
}

function claimsPolicyAllows(payload) {
  if (!payload || typeof payload !== 'object') return false;

  const issuerMatches = payload.iss === env.jwtIssuer;
  const audienceMatches = validAudience(payload.aud);
  if (issuerMatches && audienceMatches) return true;

  // التوافق القديم يجب أن يكون claimless بالكامل ومن إصدار سابق للترحيل.
  // وجود claim واحد فقط أو claim خاطئ يُرفض fail-closed.
  const fullyClaimless = payload.iss === undefined && payload.aud === undefined;
  const issuedAt = Number(payload.iat);
  return fullyClaimless
    && Number.isFinite(issuedAt)
    && issuedAt < LEGACY_CLAIMLESS_ISSUED_BEFORE;
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
async function verifyAccessToken(token) {
  const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
  if (!claimsPolicyAllows(payload)) {
    throw new Error('invalid token claims');
  }
  if (!(await accountStillAllowed(payload))) {
    throw new Error('account unavailable');
  }
  return payload;
}

function tokenFromRequest(req) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;

  // الواجهة القديمة للوحة اللحظية تقرأ localStorage مباشرة. في نسخة الويب
  // نخزن Sentinel غير سري فقط؛ عند رؤيته نستخدم جلسة HttpOnly بدل JWT من JS.
  if (bearer && bearer !== ADMIN_SESSION_SENTINEL) {
    return { token: bearer, source: 'bearer' };
  }

  const cookieToken = getAdminSessionTokenFromCookieHeader(req.headers.cookie);
  if (cookieToken) return { token: cookieToken, source: 'admin-cookie' };

  return { token: null, source: null };
}

async function authenticate(req, res, next) {
  const { token, source } = tokenFromRequest(req);

  if (!token) {
    return res.status(401).json({ message: 'التوكن مفقود' });
  }

  try {
    const payload = await verifyAccessToken(token);
    // جلسة الـHttpOnly مخصّصة للأدمن فقط ولا تُستخدم لأي دور آخر.
    if (source === 'admin-cookie' && payload.role !== ROLES.ADMIN) {
      return res.status(401).json({ message: 'جلسة غير صالحة' });
    }
    req.auth = payload;
    req.authSource = source;
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

module.exports = {
  authenticate,
  authorize,
  verifyAccessToken,
  tokenFromRequest,
  accountStillAllowed,
  claimsPolicyAllows,
  LEGACY_CLAIMLESS_ISSUED_BEFORE,
};
