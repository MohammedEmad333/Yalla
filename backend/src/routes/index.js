'use strict';

// تجميع كل مسارات الـ API تحت راوتر واحد
const router = require('express').Router();

const { buildOpenApiSpec } = require('../docs/openapi');
const { docsHtml } = require('../docs/docsPage');

// توثيق الواجهة (عام، بلا مصادقة): مواصفة JSON + صفحة عرض بسيطة
router.get('/openapi.json', (req, res) => res.json(buildOpenApiSpec()));
router.get('/docs', (req, res) => res.type('html').send(docsHtml()));

router.use('/auth', require('./auth.routes'));
router.use('/orders', require('./order.routes'));
router.use('/captains', require('./captain.routes'));
router.use('/wallet', require('./wallet.routes'));
router.use('/admin', require('./admin.routes'));
router.use('/notifications', require('./notification.routes'));

// فحص صحّة الخادم
router.get('/health', (req, res) => res.json({ status: 'ok', service: 'yalla-api' }));

module.exports = router;
