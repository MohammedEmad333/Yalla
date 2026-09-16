'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/adminAccess.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { enforceAdminAccess, requireSuperAdmin } = require('../middlewares/adminAccess.middleware');
const { ROLES } = require('../utils/constants');

router.use(authenticate, authorize(ROLES.ADMIN), enforceAdminAccess);
router.get('/me', ctrl.me);
router.get('/admins', requireSuperAdmin, ctrl.list);
router.post('/admins', requireSuperAdmin, ctrl.create);
router.patch('/admins/:adminId', requireSuperAdmin, ctrl.update);

module.exports = router;
