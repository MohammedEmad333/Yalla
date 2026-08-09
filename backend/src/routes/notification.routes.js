'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/notification.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// أي حساب مصادَق عليه (مستخدم/كابتن) يدير رموز أجهزته وإشعاراته
router.use(authenticate);

// رموز أجهزة FCM
router.post('/device-token', ctrl.registerDeviceToken);
router.delete('/device-token', ctrl.removeDeviceToken);

// الإشعارات داخل التطبيق (read-all قبل /:id لتفادي التعارض)
router.get('/', ctrl.listMine);
router.patch('/read-all', ctrl.markAllRead);
router.patch('/:id/read', ctrl.markRead);

module.exports = router;
