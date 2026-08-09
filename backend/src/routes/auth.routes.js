'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { ROLES } = require('../utils/constants');

// مسارات عامّة (بدون مصادقة)
router.post('/register', ctrl.registerUser);       // إنشاء حساب مستخدم
router.post('/login', ctrl.loginUser);             // دخول المستخدم/الأدمن
router.post('/captain/login', ctrl.loginCaptain);  // دخول الكابتن

// مسارات محميّة
router.get('/me', authenticate, ctrl.me);          // استعادة الجلسة الحالية
router.post(
  '/captain/register',
  authenticate,
  authorize(ROLES.ADMIN),                          // الأدمن فقط ينشئ الكباتن
  ctrl.registerCaptain
);

module.exports = router;
