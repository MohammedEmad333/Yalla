'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');

router.post('/register', ctrl.registerUser);       // إنشاء حساب مستخدم
router.post('/login', ctrl.loginUser);             // دخول المستخدم/الأدمن
router.post('/captain/login', ctrl.loginCaptain);  // دخول الكابتن

module.exports = router;
