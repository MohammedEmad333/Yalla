'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/feature.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { requireAdminCapability } = require('../middlewares/adminAccess.middleware');
const { ROLES } = require('../utils/constants');

router.get('/coupons', ctrl.publicCoupons);

router.use(authenticate);

router.get('/addresses', authorize(ROLES.USER), ctrl.listAddresses);
router.post('/addresses', authorize(ROLES.USER), ctrl.addAddress);
router.patch('/addresses/:addressId', authorize(ROLES.USER), ctrl.updateAddress);
router.delete('/addresses/:addressId', authorize(ROLES.USER), ctrl.deleteAddress);
router.get('/favorites', authorize(ROLES.USER), ctrl.listFavorites);
router.post('/favorites/:restaurantId/toggle', authorize(ROLES.USER), ctrl.toggleFavorite);
router.post('/reorder/:orderId', authorize(ROLES.USER), ctrl.reorder);
router.post('/coupons/validate', authorize(ROLES.USER), ctrl.validateCoupon);

router.get('/merchant/analytics', authorize(ROLES.MERCHANT), ctrl.merchantAnalytics);
router.get('/merchant/finance', authorize(ROLES.MERCHANT), ctrl.merchantFinance);
router.post('/merchant/settlements', authorize(ROLES.MERCHANT), ctrl.requestMerchantSettlement);
router.patch('/merchant/open', authorize(ROLES.MERCHANT), ctrl.setMerchantOpen);

router.get('/admin/operations-alerts', authorize(ROLES.ADMIN), requireAdminCapability('operations'), ctrl.operationsAlerts);
router.get('/admin/finance', authorize(ROLES.ADMIN), requireAdminCapability('finance'), ctrl.adminFinance);
router.get('/admin/coupons', authorize(ROLES.ADMIN), requireAdminCapability('marketing'), ctrl.adminListCoupons);
router.post('/admin/coupons', authorize(ROLES.ADMIN), requireAdminCapability('marketing'), ctrl.adminCreateCoupon);
router.patch('/admin/coupons/:id', authorize(ROLES.ADMIN), requireAdminCapability('marketing'), ctrl.adminUpdateCoupon);
router.get('/admin/merchant-settlements', authorize(ROLES.ADMIN), requireAdminCapability('settlements'), ctrl.adminListSettlements);
router.patch('/admin/merchant-settlements/:id', authorize(ROLES.ADMIN), requireAdminCapability('settlements'), ctrl.adminProcessSettlement);

module.exports = router;
