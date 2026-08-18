'use strict';

// تواصل الزبون المباشر مع الأدمن (Card 44). مسارات الأدمن في admin.routes.
const router = require('express').Router();
const ctrl = require('../controllers/support.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { ROLES } = require('../utils/constants');

router.use(authenticate, authorize(ROLES.USER));

router.get('/messages', ctrl.myMessages);
router.post('/messages', ctrl.send);

module.exports = router;
