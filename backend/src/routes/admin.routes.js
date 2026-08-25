'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/admin.controller');
const support = require('../controllers/support.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { uploadAvatar } = require('../middlewares/upload.middleware');
const { ROLES } = require('../utils/constants');

// كل مسارات الإدارة للأدمن فقط
router.use(authenticate, authorize(ROLES.ADMIN));

// مؤشّرات الأداء (KPIs)
router.get('/stats', ctrl.getStats);

// إرسال رسائل/إشعارات جماعية (Card 66): للجميع أو كباتن/زبائن محدّدين
router.post('/notifications', ctrl.sendBroadcast);

// إدارة المستخدمين
router.get('/users', ctrl.listUsers);
router.get('/customers', ctrl.listCustomersDetailed); // Card 41: تفاصيل كاملة للزبائن
router.patch('/users/:userId/active', ctrl.setUserActive);
router.delete('/users/:userId', ctrl.deleteUser); // Card 38: حذف نهائي

// إدارة الكباتن
router.get('/captains', ctrl.listCaptains);
router.get('/captains/detailed', ctrl.listCaptainsDetailed); // Card 37: جدول كامل للكباتن

// Card 79: طلبات توثيق الكباتن (تسجيل من التطبيق) + بيانات الكباتن الحسّاسة
// (قبل مسارات /captains/:captainId لتفادي التقاط "applications"/"data" كمعرّف)
router.get('/captain-applications', ctrl.listCaptainApplications);
router.post('/captain-applications/:applicationId/approve', ctrl.approveCaptainApplication);
router.post('/captain-applications/:applicationId/reject', ctrl.rejectCaptainApplication);
router.get('/captains/data', ctrl.listCaptainsData); // صفحة "بيانات الكباتن"
router.patch('/captains/:captainId/approve', ctrl.setCaptainApproval);
// Card 78: تعديل بيانات حساب الكابتن (اسم/جوال/مركبة/كلمة سر) + تغيير صورته
router.patch('/captains/:captainId', ctrl.updateCaptain);
router.post('/captains/:captainId/avatar', uploadAvatar.single('avatar'), ctrl.uploadCaptainAvatar);
router.delete('/captains/:captainId', ctrl.deleteCaptain); // Card 38: حذف نهائي

// محفظة الكابتن وتسوية العمولة (COD)
router.get('/captains/:captainId/wallet', ctrl.captainWallet);
router.post('/captains/:captainId/settle', ctrl.settleCaptain);

// طلبات سحب أرباح الكباتن (Card 19): عرض + تنفيذ "تم التحويل"/رفض
router.get('/withdrawals', ctrl.listWithdrawals);
router.patch('/withdrawals/:withdrawalId', ctrl.processWithdrawal);

// مراقبة المحادثات بين الزبائن والكباتن (Card 32 + Card 45)
router.get('/chats', ctrl.listChats);
router.get('/chats/:orderId/messages', ctrl.getChatMessages);
router.post('/chats/:orderId/messages', ctrl.sendChatMessage);
router.get('/chats/:orderId/export', ctrl.exportChat);

// التواصل المباشر بين الزبائن والأدمن (Card 46)
router.get('/support', support.listThreads);
router.get('/support/:userId/messages', support.threadMessages);
router.post('/support/:userId/messages', support.reply);
router.delete('/support/messages/:messageId', support.deleteMessage); // Card 56: حذف رسالة نهائيًا

// شحن رصيد المستخدمين — مراجعة الطلبات المعلّقة والموافقة/الرفض
router.get('/wallet/topups', ctrl.listTopups);
router.post('/wallet/topups/:txId/approve', ctrl.approveTopup);
router.post('/wallet/topups/:txId/reject', ctrl.rejectTopup);
router.get('/users/:userId/wallet', ctrl.userWallet);
// Card 81: إضافة رصيد لحساب خارجي مؤقّت (طلبات الأدمن/الواتساب)
router.post('/users/:userId/wallet/credit', ctrl.creditExternalUser);
// Card 87: تعديل رصيد حساب خارجي مؤقّت على قيمة محدّدة
router.patch('/users/:userId/wallet/balance', ctrl.setExternalUserBalance);

module.exports = router;
