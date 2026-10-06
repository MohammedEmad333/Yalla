'use strict';

const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const { validateBody } = require('../middlewares/validate.middleware');
const { rateLimit } = require('../middlewares/rateLimit.middleware');
const { V } = require('../utils/validate');
const { ROLES } = require('../utils/constants');
const {
  serializeAdminSessionCookie,
  serializeAdminSessionClearCookie,
} = require('../utils/adminSession');

const adminLoginLimiter = rateLimit({ windowMs: 60_000, max: 10 });
const loginSchema = {
  phone: [V.required, V.phone],
  password: [V.required],
};

function isOfficialAdminWebOrigin(req) {
  return String(req.headers.origin || '').toLowerCase() === 'https://admin.yalladelivery.org';
}

// دخول مخصّص للوحة الأدمن:
// - الويب الرسمي يحصل على جلسة HttpOnly ولا يرى JWT داخل JavaScript.
// - تطبيق Capacitor/التطوير يبقيان Bearer token للتوافق مع البيئة الأصلية.
router.post('/login', adminLoginLimiter, validateBody(loginSchema), (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  res.set('Pragma', 'no-cache');
  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (!body?.token || !body?.user) return originalJson(body);

    if (body.user.role !== ROLES.ADMIN) {
      res.status(403);
      return originalJson({ message: 'هذا الحساب ليس أدمن' });
    }

    if (!isOfficialAdminWebOrigin(req)) return originalJson(body);

    res.setHeader('Set-Cookie', serializeAdminSessionCookie(body.token));
    const { token, ...safeBody } = body;
    return originalJson({ ...safeBody, session: true });
  };

  return authController.loginUser(req, res, next);
});

router.post('/logout', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', serializeAdminSessionClearCookie());
  res.status(204).end();
});

module.exports = router;
module.exports.isOfficialAdminWebOrigin = isOfficialAdminWebOrigin;
