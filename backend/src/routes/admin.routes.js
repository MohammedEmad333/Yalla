'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/admin.controller');
const support = require('../controllers/support.controller');
const restaurantCtrl = require('../controllers/restaurant.controller');
const expansionCtrl = require('../controllers/expansion.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { enforceAdminAccess, requireAdminCapability } = require('../middlewares/adminAccess.middleware');
const { uploadAvatar, uploadImage } = require('../middlewares/upload.middleware');
const { ROLES } = require('../utils/constants');

// كل مسارات الإدارة للأدمن فقط، ثم نطبّق صلاحيات القسم حسب adminRole.
router.use(authenticate, authorize(ROLES.ADMIN), enforceAdminAccess);

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

// Compatibility upload endpoint for promotion banners.
// Kept under /api/admin as a stable fallback in addition to /api/expansion/admin/...
router.post('/banners/:bannerId/image', requireAdminCapability('marketing'), uploadImage.single('image'), expansionCtrl.uploadBannerImage);

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
router.get('/customer-withdrawals', ctrl.listCustomerWithdrawals);
router.patch('/customer-withdrawals/:withdrawalId', ctrl.processCustomerWithdrawal);

router.get('/chats', ctrl.listChats);
router.get('/chats/:orderId/messages', ctrl.getChatMessages);
router.post('/chats/:orderId/messages', ctrl.sendChatMessage);
router.delete('/chats/:orderId/messages/:messageId', ctrl.deleteChatMessage);
router.get('/chats/:orderId/export', ctrl.exportChat);

router.get('/support', support.listThreads);
router.get('/support/:userId/messages', support.threadMessages);
router.post('/support/:userId/messages', support.reply);
router.delete('/support/messages/:messageId', support.deleteMessage);

router.get('/wallet/topups', ctrl.listTopups);
router.post('/wallet/topups/:txId/approve', ctrl.approveTopup);
router.post('/wallet/topups/:txId/reject', ctrl.rejectTopup);
router.get('/users/:userId/wallet', ctrl.userWallet);
router.post('/users/:userId/wallet/credit', ctrl.creditExternalUser);
router.post('/users/:userId/wallet/add', ctrl.creditUser);
router.patch('/users/:userId/wallet/balance', ctrl.setExternalUserBalance);

module.exports = router;
