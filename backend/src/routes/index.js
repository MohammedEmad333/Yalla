'use strict';

const router = require('express').Router();
const { buildOpenApiSpec } = require('../docs/openapi');
const { docsHtml } = require('../docs/docsPage');
const { listNeighborhoods, listNeighborhoodsByCity, neighborhoodsByCity, listCities } = require('../utils/neighborhoods');
const { listGovernorates } = require('../utils/governorates');

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
router.use('/merchant-staff', require('./merchantStaff.routes'));
router.use('/notifications', require('./notification.routes'));
router.use('/features', require('./feature.routes'));
router.use('/commerce', require('./commerce.routes'));
router.use('/expansion', require('./expansion.routes'));

router.get('/health', (req, res) => res.json({ status: 'ok', service: 'yalla-api' }));
module.exports = router;
