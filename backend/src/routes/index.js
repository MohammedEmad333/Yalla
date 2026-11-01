'use strict';

const router = require('express').Router();
const env = require('../config/env');
const { buildOpenApiSpec } = require('../docs/openapi');
const { docsHtml } = require('../docs/docsPage');
const { listNeighborhoods, listNeighborhoodsByCity, neighborhoodsByCity, listCities } = require('../utils/neighborhoods');
const { listGovernorates } = require('../utils/governorates');

// مستندات الـAPI مفيدة للتطوير، لكن لا نكشف خريطة المسارات العامة في production
// إلا إذا فُعّلت صراحةً عبر ENABLE_API_DOCS=true.
if (env.nodeEnv !== 'production' || env.enableApiDocs) {
  router.get('/openapi.json', (req, res) => res.json(buildOpenApiSpec()));
  router.get('/docs', (req, res) => res.type('html').send(docsHtml()));
}

router.get('/cities', (req, res) => res.json(listCities()));
router.get('/neighborhoods', (req, res) => {
  if (req.query.grouped) return res.json(neighborhoodsByCity());
  if (req.query.city) return res.json(listNeighborhoodsByCity(req.query.city));
  return res.json(listNeighborhoods());
});
router.get('/governorates', (req, res) => res.json(listGovernorates()));
router.use('/app-update', require('./appUpdate.routes'));
router.use('/settings', require('./settings.routes'));

router.use('/auth/admin-session', require('./adminSession.routes'));
router.use('/auth', require('./auth.routes'));
router.use('/orders', require('./order.routes'));
router.use('/restaurants', require('./restaurant.routes'));
router.use('/captains', require('./captain.routes'));
router.use('/telegram-captain', require('./telegramCaptain.routes'));
router.use('/payments', require('./payment.routes'));
router.use('/support', require('./support.routes'));
router.use('/bot', require('./bot.routes'));
router.use('/admin/access', require('./adminAccess.routes'));
router.use('/admin/dispatch', require('./smartDispatch.routes'));
router.use('/admin/jawwal-refunds', require('./jawwalRefund.routes'));
router.use('/admin', require('./admin.routes'));
router.use('/merchant', require('./merchant.routes'));
router.use('/merchant-staff', require('./merchantStaff.routes'));
router.use('/notifications', require('./notification.routes'));
router.use('/features', require('./feature.routes'));
router.use('/commerce', require('./commerce.routes'));
router.use('/expansion', require('./expansion.routes'));

// Health endpoint intentionally returns only liveness metadata. Commit/build IDs stay
// out of the public response to avoid unnecessary deployment fingerprinting.
router.get('/health', (req, res) => res.json({
  status: 'ok',
  service: 'yalla-api',
}));

module.exports = router;
