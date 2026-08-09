'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/order.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { ROLES } = require('../utils/constants');

// كل مسارات الطلبات تتطلّب مصادقة
router.use(authenticate);

// المستخدم: تسعيرة تقديرية قبل الطلب، ثم إنشاء الطلب
router.post('/quote', authorize(ROLES.USER), ctrl.getQuote);
router.post('/', authorize(ROLES.USER), ctrl.createOrder);

// الأدمن: عرض الطلبات النشطة + الكباتن المتاحين + الإسناد
router.get('/active', authorize(ROLES.ADMIN), ctrl.getActiveOrders);
router.get('/available-captains', authorize(ROLES.ADMIN), ctrl.getAvailableCaptains);
router.patch('/:orderId/assign', authorize(ROLES.ADMIN), ctrl.assignOrder);
router.patch('/:orderId/auto-assign', authorize(ROLES.ADMIN), ctrl.autoAssign);

// الكابتن: تحديث حالة الطلب
router.patch('/:orderId/status', authorize(ROLES.CAPTAIN), ctrl.updateStatus);

// أي طرف مصرّح له (المالك/الكابتن المُسنَد/الأدمن) يجلب طلبًا للتتبّع
// التحقّق الدقيق من الملكيّة يتمّ داخل طبقة الخدمة
router.get('/:orderId', ctrl.getOrder);

module.exports = router;
