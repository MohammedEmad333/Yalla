'use strict';

const path = require('path');
const router = require('express').Router();
const ctrl = require('../controllers/admin.controller');
const support = require('../controllers/support.controller');
const restaurantCtrl = require('../controllers/restaurant.controller');
const expansionCtrl = require('../controllers/expansion.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { enforceAdminAccess, requireAdminCapability } = require('../middlewares/adminAccess.middleware');
const { uploadAvatar, uploadImage, IDS_DIR, RECEIPTS_DIR } = require('../middlewares/upload.middleware');
const { ROLES } = require('../utils/constants');

// كل مسارات الإدارة للأدمن فقط، ثم نطبّق صلاحيات القسم حسب adminRole.
router.use(authenticate, authorize(ROLES.ADMIN), enforceAdminAccess);

// ملفات حساسة لا تُخدَم من static. الوصول يتطلب جلسة Admin وصلاحية مناسبة.
router.get('/private-files/:kind/:filename', (req, res) => {
  const roots = { ids: IDS_DIR, receipts: RECEIPTS_DIR };
  const allowedRoles = {
    ids: new Set(['super_admin', 'operations']),
    receipts: new Set(['super_admin', 'finance']),
  };
  const kind = String(req.params.kind || '');
  const root = roots[kind];
  if (!root) return res.status(404).json({ message: 'الملف غير موجود' });
  if (!allowedRoles[kind].has(req.auth.adminRole)) {
    return res.status(403).json({ message: 'ليس لديك صلاحية لعرض هذا الملف' });
  }

  const filename = path.basename(String(req.params.filename || ''));
  if (!filename || filename !== req.params.filename) {
    return res.status(400).json({ message: 'اسم ملف غير صالح' });
  }

  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  return res.sendFile(filename, { root }, (err) => {
    if (!err) return;
    if (!res.headersSent) res.status(err.statusCode === 404 ? 404 : 500).json({ message: 'تعذر تحميل الملف' });
  });
});

router.get('/stats', ctrl.getStats);
router.post('/stats/reset', ctrl.resetStats);
router.get('/wallet', ctrl.getAdminWallet);
router.get('/wallet/export', ctrl.exportAdminWallet);
router.get('/user-counts', ctrl.getUserCounts);
router.get('/account', ctrl.getAdminAccount);
router.patch('/account', ctrl.updateAdminAccount);
router.get('/settings', ctrl.getSettings);
router.patch('/settings', ctrl.updateSettings);
router.post('/notifications', ctrl.sendBroadcast);

router.post('/banners/:bannerId/image', requireAdminCapability('marketing'), uploadImage.single('image'), expansionCtrl.uploadBannerImage);

router.get('/restaurants/applications', restaurantCtrl.adminListMerchantApplications);
router.post('/restaurants/applications/:restaurantId/approve', restaurantCtrl.adminApproveMerchantApplication);
router.post('/restaurants/applications/:restaurantId/reject', restaurantCtrl.adminRejectMerchantApplication);
router.get('/restaurants', restaurantCtrl.adminListRestaurants);
router.post('/restaurants', restaurantCtrl.createRestaurant);
router.patch('/restaurants/:restaurantId', restaurantCtrl.updateRestaurant);
router.delete('/restaurants/:restaurantId', restaurantCtrl.deleteRestaurant);
router.get('/restaurants/:restaurantId/merchant', restaurantCtrl.adminGetMerchant);
router.put('/restaurants/:restaurantId/merchant', restaurantCtrl.adminUpsertMerchant);
router.post('/restaurants/:restaurantId/image', uploadImage.single('image'), restaurantCtrl.uploadRestaurantImage);
router.get('/restaurants/:restaurantId/menu', restaurantCtrl.adminListMenu);
router.post('/restaurants/:restaurantId/menu', restaurantCtrl.createMenuItem);
router.patch('/menu-items/:itemId', restaurantCtrl.updateMenuItem);
router.delete('/menu-items/:itemId', restaurantCtrl.deleteMenuItem);
router.post('/menu-items/:itemId/image', uploadImage.single('image'), restaurantCtrl.uploadMenuItemImage);

router.get('/users', ctrl.listUsers);
router.get('/customers', ctrl.listCustomersDetailed);
router.patch('/users/:userId/active', ctrl.setUserActive);
router.delete('/users/:userId', ctrl.deleteUser);

router.get('/captains', ctrl.listCaptains);
router.get('/captains/detailed', ctrl.listCaptainsDetailed);
router.get('/captain-applications', ctrl.listCaptainApplications);
router.post('/captain-applications/:applicationId/approve', ctrl.approveCaptainApplication);
router.post('/captain-applications/:applicationId/reject', ctrl.rejectCaptainApplication);
router.get('/captains/data', ctrl.listCaptainsData);
router.patch('/captains/:captainId/approve', ctrl.setCaptainApproval);
router.patch('/captains/:captainId', ctrl.updateCaptain);
router.post('/captains/:captainId/avatar', uploadAvatar.single('avatar'), ctrl.uploadCaptainAvatar);
router.delete('/captains/:captainId', ctrl.deleteCaptain);

router.get('/captains/:captainId/wallet', ctrl.captainWallet);
router.post('/captains/:captainId/settle', ctrl.settleCaptain);
router.get('/withdrawals', ctrl.listWithdrawals);
router.patch('/withdrawals/:withdrawalId', ctrl.processWithdrawal);

router.get('/chats', ctrl.listChats);
router.get('/chats/:orderId/messages', ctrl.getChatMessages);
router.post('/chats/:orderId/messages', ctrl.sendChatMessage);
router.delete('/chats/:orderId/messages/:messageId', ctrl.deleteChatMessage);
router.get('/chats/:orderId/export', ctrl.exportChat);

router.get('/support', support.listThreads);
router.get('/support/:userId/messages', support.threadMessages);
router.post('/support/:userId/messages', support.reply);
router.delete('/support/messages/:messageId', support.deleteMessage);

module.exports = router;
