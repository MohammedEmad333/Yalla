'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/order.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { validateBody } = require('../middlewares/validate.middleware');
const { V } = require('../utils/validate');
const { ROLES } = require('../utils/constants');

// مخطّطات التحقّق
const quoteSchema = {
  pickup: [V.required, V.coordinates],   // [lng, lat]
  dropoff: [V.required, V.coordinates],
};
const createOrderSchema = {
  pickup: [V.required, V.location],      // {address, location:{coordinates}}
  dropoff: [V.required, V.location],
};
const rateSchema = {
  stars: [V.required, V.number, V.inRange(1, 5)],
};
const assignSchema = {
  captainId: [V.required, V.string],
};

// كل مسارات الطلبات تتطلّب مصادقة
router.use(authenticate);

// المستخدم: تسعيرة تقديرية قبل الطلب، ثم إنشاء الطلب
router.post('/quote', authorize(ROLES.USER), validateBody(quoteSchema), ctrl.getQuote);
router.post('/', authorize(ROLES.USER), validateBody(createOrderSchema), ctrl.createOrder);

// المستخدم: سجلّ طلباتي (قبل مسار /:orderId لتفادي التعارض)
router.get('/mine', authorize(ROLES.USER), ctrl.getMyOrders);

// المستخدم: تقييم الكابتن بعد التسليم
router.post('/:orderId/rate', authorize(ROLES.USER), validateBody(rateSchema), ctrl.rateOrder);

// المستخدم أو الأدمن: إلغاء الطلب (قبل الاستلام)
router.post('/:orderId/cancel', authorize(ROLES.USER, ROLES.ADMIN), ctrl.cancelOrder);

// الأدمن: عرض الطلبات النشطة + بحث/فلترة مع ترقيم + الكباتن المتاحين + الإسناد
router.get('/active', authorize(ROLES.ADMIN), ctrl.getActiveOrders);
router.get('/search', authorize(ROLES.ADMIN), ctrl.listOrders);
router.get('/available-captains', authorize(ROLES.ADMIN), ctrl.getAvailableCaptains);
router.patch('/:orderId/assign', authorize(ROLES.ADMIN), validateBody(assignSchema), ctrl.assignOrder);
router.patch('/:orderId/auto-assign', authorize(ROLES.ADMIN), ctrl.autoAssign);

// الكابتن: تحديث حالة الطلب
router.patch('/:orderId/status', authorize(ROLES.CAPTAIN), ctrl.updateStatus);

// أي طرف مصرّح له (المالك/الكابتن المُسنَد/الأدمن) يجلب طلبًا للتتبّع
// التحقّق الدقيق من الملكيّة يتمّ داخل طبقة الخدمة
router.get('/:orderId', ctrl.getOrder);

module.exports = router;
