'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/admin.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { ROLES } = require('../utils/constants');

// كل مسارات الإدارة للأدمن فقط
router.use(authenticate, authorize(ROLES.ADMIN));

// مؤشّرات الأداء (KPIs)
router.get('/stats', ctrl.getStats);

// إدارة المستخدمين
router.get('/users', ctrl.listUsers);
router.patch('/users/:userId/active', ctrl.setUserActive);

// إدارة الكباتن
router.get('/captains', ctrl.listCaptains);
router.patch('/captains/:captainId/approve', ctrl.setCaptainApproval);

// محفظة الكابتن وتسوية العمولة (COD)
router.get('/captains/:captainId/wallet', ctrl.captainWallet);
router.post('/captains/:captainId/settle', ctrl.settleCaptain);

module.exports = router;
