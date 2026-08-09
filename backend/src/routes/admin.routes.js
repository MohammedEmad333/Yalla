'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/admin.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { ROLES } = require('../utils/constants');

// كل مسارات الإدارة للأدمن فقط
router.use(authenticate, authorize(ROLES.ADMIN));

// إدارة المستخدمين
router.get('/users', ctrl.listUsers);
router.patch('/users/:userId/active', ctrl.setUserActive);

// إدارة الكباتن
router.get('/captains', ctrl.listCaptains);
router.patch('/captains/:captainId/approve', ctrl.setCaptainApproval);

module.exports = router;
