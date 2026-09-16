'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/smartDispatch.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { requireAdminCapability } = require('../middlewares/adminAccess.middleware');
const { ROLES } = require('../utils/constants');

router.use(authenticate, authorize(ROLES.ADMIN), requireAdminCapability('dispatch'));
router.get('/pending', ctrl.pending);
router.get('/:orderId/recommendations', ctrl.recommendations);
router.post('/:orderId/assign-best', ctrl.assignBest);

module.exports = router;
