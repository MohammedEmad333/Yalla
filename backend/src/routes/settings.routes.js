'use strict';

const router = require('express').Router();
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { ROLES } = require('../utils/constants');
const systemConfig = require('../services/systemConfig.service');

router.get('/public', async (req, res, next) => {
  try {
    const orderMaintenance = await systemConfig.getOrderMaintenance();
    res.json({ orderMaintenance });
  } catch (err) { next(err); }
});

router.get('/admin/order-maintenance', authenticate, authorize(ROLES.ADMIN), async (req, res, next) => {
  try {
    res.json(await systemConfig.getOrderMaintenance());
  } catch (err) { next(err); }
});

router.patch('/admin/order-maintenance', authenticate, authorize(ROLES.ADMIN), async (req, res, next) => {
  try {
    if (typeof req.body?.enabled !== 'boolean') {
      return res.status(400).json({ message: 'enabled يجب أن تكون true أو false' });
    }
    const state = await systemConfig.setOrderMaintenance(
      req.body.enabled,
      req.auth.id,
      req.body.message
    );
    res.json(state);
  } catch (err) { next(err); }
});

module.exports = router;
