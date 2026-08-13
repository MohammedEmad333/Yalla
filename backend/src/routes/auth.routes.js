'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { validateBody } = require('../middlewares/validate.middleware');
const { rateLimit } = require('../middlewares/rateLimit.middleware');
const { V } = require('../utils/validate');
const { ROLES } = require('../utils/constants');

// حدّ أشدّ على مسارات المصادقة لمنع هجمات التخمين (brute force)
const authLimiter = rateLimit({ windowMs: 60_000, max: 20 });

// مخطّطات التحقّق
const registerSchema = {
  name: [V.required, V.string],
  lastName: [V.string], // اسم العائلة — اختياري
  phone: [V.required, V.phone],
  password: [V.required, V.minLength(6)],
};
const loginSchema = {
  phone: [V.required, V.phone],
  password: [V.required],
};
const captainRegisterSchema = {
  name: [V.required, V.string],
  phone: [V.required, V.phone],
  password: [V.required, V.minLength(6)],
  vehicleType: [V.isIn(['bicycle', 'motorcycle'])], // اختياري
};

// مسارات عامّة (بحدّ معدّل + تحقّق)
router.post('/register', authLimiter, validateBody(registerSchema), ctrl.registerUser);
router.post('/login', authLimiter, validateBody(loginSchema), ctrl.loginUser);
router.post('/captain/login', authLimiter, validateBody(loginSchema), ctrl.loginCaptain);

// مسارات محميّة
router.get('/me', authenticate, ctrl.me);
router.post(
  '/captain/register',
  authenticate,
  authorize(ROLES.ADMIN),
  validateBody(captainRegisterSchema),
  ctrl.registerCaptain
);

module.exports = router;
