'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/expansion.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { ROLES } = require('../utils/constants');

// عامّة لتغذية واجهة المتاجر قبل/بعد تسجيل الدخول.
router.get('/search', ctrl.searchStores);
router.get('/banners', ctrl.publicBanners);

router.use(authenticate);

router.get('/rewards', authorize(ROLES.USER), ctrl.rewards);
router.post('/referrals/apply', authorize(ROLES.USER), ctrl.applyReferral);
router.get('/issues', authorize(ROLES.USER), ctrl.listIssues);
router.post('/issues', authorize(ROLES.USER), ctrl.createIssue);

router.get('/admin/issues', authorize(ROLES.ADMIN), ctrl.adminIssues);
router.patch('/admin/issues/:issueId', authorize(ROLES.ADMIN), ctrl.resolveIssue);
router.get('/admin/audit', authorize(ROLES.ADMIN), ctrl.auditLogs);
router.get('/admin/system-health', authorize(ROLES.ADMIN), ctrl.systemHealth);
router.patch('/admin/restaurants/:restaurantId/merchandising', authorize(ROLES.ADMIN), ctrl.setMerchandising);
router.get('/admin/banners', authorize(ROLES.ADMIN), ctrl.adminBanners);
router.post('/admin/banners', authorize(ROLES.ADMIN), ctrl.createBanner);
router.patch('/admin/banners/:bannerId', authorize(ROLES.ADMIN), ctrl.updateBanner);
router.delete('/admin/banners/:bannerId', authorize(ROLES.ADMIN), ctrl.deleteBanner);

module.exports = router;
