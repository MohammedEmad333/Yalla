'use strict';

// تجميع كل مسارات الـ API تحت راوتر واحد
const router = require('express').Router();

router.use('/auth', require('./auth.routes'));
router.use('/orders', require('./order.routes'));
router.use('/captains', require('./captain.routes'));
router.use('/admin', require('./admin.routes'));
router.use('/notifications', require('./notification.routes'));

// فحص صحّة الخادم
router.get('/health', (req, res) => res.json({ status: 'ok', service: 'yalla-api' }));

module.exports = router;
