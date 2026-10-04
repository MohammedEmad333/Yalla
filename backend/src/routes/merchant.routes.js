'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/merchant.controller');
const paymentAwareCtrl = require('../controllers/paymentAwareMerchant.controller');
const branchCtrl = require('../controllers/merchantBranch.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { requireMerchantCapability } = require('../middlewares/merchantAccess.middleware');
const { uploadImage } = require('../middlewares/upload.middleware');
const { ROLES } = require('../utils/constants');

router.use(authenticate, authorize(ROLES.MERCHANT));

router.get('/branches', requireMerchantCapability('branches'), branchCtrl.list);
router.post('/branches', requireMerchantCapability('branches'), branchCtrl.create);
router.post('/branches/:restaurantId/select', requireMerchantCapability('branches'), branchCtrl.select);
router.delete('/branches/:restaurantId', requireMerchantCapability('branches'), branchCtrl.detach);

router.get('/profile', requireMerchantCapability('profile'), ctrl.profile);
router.patch('/restaurant', requireMerchantCapability('restaurant'), ctrl.updateRestaurant);
router.post('/restaurant/image', requireMerchantCapability('restaurant'), uploadImage.single('image'), ctrl.uploadRestaurantImage);
router.get('/menu', requireMerchantCapability('menu'), ctrl.listMenu);
router.post('/menu', requireMerchantCapability('menu'), ctrl.createMenuItem);
router.patch('/menu/:itemId', requireMerchantCapability('menu'), ctrl.updateMenuItem);
router.delete('/menu/:itemId', requireMerchantCapability('menu'), ctrl.deleteMenuItem);
router.post('/menu/:itemId/image', requireMerchantCapability('menu'), uploadImage.single('image'), ctrl.uploadMenuItemImage);
router.get('/inventory', requireMerchantCapability('inventory'), ctrl.inventorySummary);
router.patch('/inventory/:itemId', requireMerchantCapability('inventory'), ctrl.adjustInventory);
router.get('/orders', requireMerchantCapability('orders'), ctrl.listOrders);
router.patch('/orders/:orderId/status', requireMerchantCapability('orders'), paymentAwareCtrl.updateOrderStatus);

module.exports = router;