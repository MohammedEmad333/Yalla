'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/jawwalRefund.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { requireAdminCapability } = require('../middlewares/adminAccess.middleware');
const { ROLES } = require('../utils/constants');

// Jawwal refunds are a financial operation. Support staff may triage issues,
// but only finance-capable admins may list or mark refunds as completed.
router.use(authenticate, authorize(ROLES.ADMIN), requireAdminCapability('finance'));
router.get('/', ctrl.list);
router.patch('/:paymentId/refunded', ctrl.markRefunded);

module.exports = router;
