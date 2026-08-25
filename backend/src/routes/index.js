'use strict';

// تجميع كل مسارات الـ API تحت راوتر واحد
const router = require('express').Router();

const { buildOpenApiSpec } = require('../docs/openapi');
const { docsHtml } = require('../docs/docsPage');
const { listNeighborhoods } = require('../utils/neighborhoods');
const { listGovernorates } = require('../utils/governorates');

// توثيق الواجهة (عام، بلا مصادقة): مواصفة JSON + صفحة عرض بسيطة
router.get('/openapi.json', (req, res) => res.json(buildOpenApiSpec()));
router.get('/docs', (req, res) => res.type('html').send(docsHtml()));

// قائمة أحياء غزة (عامّة) — تُستخدم في منتقي الحي بلوحة الأدمن وتطبيق العميل
router.get('/neighborhoods', (req, res) => res.json(listNeighborhoods()));

// Card 96: قائمة المحافظات (عامّة) — تُستخدم في منتقي "مكان السكن" عند إنشاء حساب العميل
router.get('/governorates', (req, res) => res.json(listGovernorates()));

router.use('/auth', require('./auth.routes'));
router.use('/orders', require('./order.routes'));
router.use('/captains', require('./captain.routes'));
router.use('/wallet', require('./wallet.routes'));
router.use('/support', require('./support.routes'));
router.use('/admin', require('./admin.routes'));
router.use('/notifications', require('./notification.routes'));

// فحص صحّة الخادم
router.get('/health', (req, res) => res.json({ status: 'ok', service: 'yalla-api' }));

module.exports = router;
