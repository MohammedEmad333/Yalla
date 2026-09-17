'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/expansion.controller');
const rewardsCtrl = require('../controllers/rewards.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { requireAdminCapability } = require('../middlewares/adminAccess.middleware');
const { ROLES } = require('../utils/constants');

router.get('/search', ctrl.searchStores);
router.get('/banners', ctrl.publicBanners);

router.use(authenticate);

router.get('/rewards', authorize(ROLES.USER), rewardsCtrl.rewards);
router.post('/rewards/redeem', authorize(ROLES.USER), rewardsCtrl.redeem);
router.post('/referrals/apply', authorize(ROLES.USER), rewardsCtrl.applyReferral);
router.get('/issues', authorize(ROLES.USER), ctrl.listIssues);
router.post('/issues', authorize(ROLES.USER), ctrl.createIssue);

router.get('/admin/rewards/settings', authorize(ROLES.ADMIN), requireAdminCapability('marketing'), rewardsCtrl.adminSettings);
router.patch('/admin/rewards/settings', authorize(ROLES.ADMIN), requireAdminCapability('marketing'), rewardsCtrl.updateAdminSettings);
router.get('/admin/issues', authorize(ROLES.ADMIN), requireAdminCapability('issues'), ctrl.adminIssues);
router.patch('/admin/issues/:issueId', authorize(ROLES.ADMIN), requireAdminCapability('issues'), ctrl.resolveIssue);
router.get('/admin/audit', authorize(ROLES.ADMIN), requireAdminCapability('operations'), ctrl.auditLogs);
router.get('/admin/system-health', authorize(ROLES.ADMIN), requireAdminCapability('operations'), ctrl.systemHealth);
router.patch('/admin/restaurants/:restaurantId/merchandising', authorize(ROLES.ADMIN), requireAdminCapability('marketing'), ctrl.setMerchandising);
router.get('/admin/banners', authorize(ROLES.ADMIN), requireAdminCapability('marketing'), ctrl.adminBanners);
router.post('/admin/banners', authorize(ROLES.ADMIN), requireAdminCapability('marketing'), ctrl.createBanner);
router.patch('/admin/banners/:bannerId', authorize(ROLES.ADMIN), requireAdminCapability('marketing'), ctrl.updateBanner);
router.delete('/admin/banners/:bannerId', authorize(ROLES.ADMIN), requireAdminCapability('marketing'), ctrl.deleteBanner);

module.exports = router;
