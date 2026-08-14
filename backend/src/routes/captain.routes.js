'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/captain.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { ROLES } = require('../utils/constants');

router.use(authenticate);

// الكابتن: تبديل التوفّر (online/offline)
router.patch('/status', authorize(ROLES.CAPTAIN), ctrl.toggleStatus);

// الكابتن: سجلّ التوصيلات وملخّص الأرباح
router.get('/me/orders', authorize(ROLES.CAPTAIN), ctrl.myOrders);
router.get('/me/earnings', authorize(ROLES.CAPTAIN), ctrl.myEarnings);
router.get('/me/wallet', authorize(ROLES.CAPTAIN), ctrl.myWallet);

// الكابتن: محفظة الأرباح القابلة للسحب وطلبات السحب (Card 19)
router.get('/me/balance', authorize(ROLES.CAPTAIN), ctrl.myBalance);
router.get('/me/withdrawals', authorize(ROLES.CAPTAIN), ctrl.myWithdrawals);
router.post('/me/withdrawals', authorize(ROLES.CAPTAIN), ctrl.requestWithdrawal);

// مراجعات كابتن — متاحة لأي حساب مصادَق عليه (مستخدم/كابتن/أدمن)
router.get('/:id/reviews', ctrl.reviews);

module.exports = router;
