'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/jawwalRefund.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { requireAdminCapability } = require('../middlewares/adminAccess.middleware');
const { ROLES } = require('../utils/constants');

router.use(authenticate, authorize(ROLES.ADMIN), requireAdminCapability('issues'));
router.get('/', ctrl.list);
router.patch('/:paymentId/refunded', ctrl.markRefunded);

module.exports = router;
