'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/notification.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// أي حساب مصادَق عليه (مستخدم/كابتن) يسجّل/يزيل رمز جهازه
router.use(authenticate);
router.post('/device-token', ctrl.registerDeviceToken);
router.delete('/device-token', ctrl.removeDeviceToken);

module.exports = router;
