'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/wallet.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { uploadReceipt } = require('../middlewares/upload.middleware');
const { ROLES } = require('../utils/constants');

// كل مسارات المحفظة تتطلّب مصادقة، وهي خاصّة بالمستخدم (العميل)
router.use(authenticate, authorize(ROLES.USER));

// رصيد المحفظة الحالي
router.get('/', ctrl.getWallet);

// طرق الشحن المتاحة (لعرض تعليمات التحويل في التطبيق)
router.get('/methods', ctrl.getMethods);

// سجلّ حركات المحفظة
router.get('/transactions', ctrl.getTransactions);

// طلب شحن رصيد — multipart بحقل صورة اسمه "receipt"
router.post('/topup', uploadReceipt.single('receipt'), ctrl.requestTopup);

module.exports = router;
