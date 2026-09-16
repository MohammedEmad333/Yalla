'use strict';

// تجميع كل مسارات الـ API تحت راوتر واحد
const router = require('express').Router();

const { buildOpenApiSpec } = require('../docs/openapi');
const { docsHtml } = require('../docs/docsPage');
const {
  listNeighborhoods,
  listNeighborhoodsByCity,
  neighborhoodsByCity,
  listCities,
} = require('../utils/neighborhoods');
const { listGovernorates } = require('../utils/governorates');

// توثيق الواجهة (عام، بلا مصادقة): مواصفة JSON + صفحة عرض بسيطة
router.get('/openapi.json', (req, res) => res.json(buildOpenApiSpec()));
router.get('/docs', (req, res) => res.type('html').send(docsHtml()));

router.get('/cities', (req, res) => res.json(listCities()));
router.get('/neighborhoods', (req, res) => {
  if (req.query.grouped) return res.json(neighborhoodsByCity());
  if (req.query.city) return res.json(listNeighborhoodsByCity(req.query.city));
  return res.json(listNeighborhoods());
});
router.get('/governorates', (req, res) => res.json(listGovernorates()));

router.use('/auth', require('./auth.routes'));
router.use('/orders', require('./order.routes'));
router.use('/restaurants', require('./restaurant.routes'));
router.use('/captains', require('./captain.routes'));
router.use('/wallet', require('./wallet.routes'));
router.use('/support', require('./support.routes'));
router.use('/admin', require('./admin.routes'));
router.use('/merchant', require('./merchant.routes'));
router.use('/notifications', require('./notification.routes'));
// ميزات المرحلة التالية: العناوين المحفوظة، المفضلة، إعادة الطلب، الكوبونات،
// تحليلات ومستحقات الشركاء، وتنبيهات العمليات والملخص المالي للإدارة.
router.use('/features', require('./feature.routes'));
// تنفيذ الطلب بالكوبون وإعادة طلب متجر كامل بنقرة واحدة.
router.use('/commerce', require('./commerce.routes'));

router.get('/health', (req, res) => res.json({ status: 'ok', service: 'yalla-api' }));

module.exports = router;
