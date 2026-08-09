'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/captain.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { ROLES } = require('../utils/constants');

router.use(authenticate);

// الكابتن: تبديل التوفّر (online/offline)
router.patch('/status', authorize(ROLES.CAPTAIN), ctrl.toggleStatus);

module.exports = router;
