'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/payment.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { ROLES } = require('../utils/constants');

router.use(authenticate, authorize(ROLES.USER));

router.post('/jawwal/orders/:orderId/start', ctrl.start);
router.post('/jawwal/orders/:orderId/confirm', ctrl.confirm);
router.post('/jawwal/orders/:orderId/cancel', ctrl.cancel);
router.get('/jawwal/orders/:orderId', ctrl.status);

module.exports = router;
