'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/merchantStaff.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { rateLimit } = require('../middlewares/rateLimit.middleware');
const { ROLES } = require('../utils/constants');

router.post('/login', rateLimit({ windowMs: 60_000, max: 20 }), ctrl.login);
router.use(authenticate, authorize(ROLES.MERCHANT));
router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.patch('/:staffId', ctrl.update);
router.delete('/:staffId', ctrl.remove);

module.exports = router;
