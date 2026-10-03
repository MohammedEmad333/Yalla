'use strict';

const router = require('express').Router();
const commerce = require('../services/commerce.service');
const directPayment = require('../services/directPayment.service');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { blockOrderCreationDuringMaintenance } = require('../middlewares/orderMaintenance.middleware');
const { ROLES } = require('../utils/constants');

router.use(authenticate, authorize(ROLES.USER));

router.post('/restaurant-order', blockOrderCreationDuringMaintenance, async (req, res, next) => {
  try {
    const order = await commerce.placeRestaurantOrder(
      req.auth.id,
      req.body,
      req.get('Idempotency-Key'),
      { paymentRequired: true }
    );
    try {
      const paymentSession = await directPayment.startOrderPayment(req.auth.id, order._id);
      const body = typeof order.toObject === 'function' ? order.toObject() : order;
      res.status(201).json({ ...body, paymentSession });
    } catch (err) {
      await directPayment.cancelOrderPayment(req.auth.id, order._id).catch(() => {});
      throw err;
    }
  } catch (err) { next(err); }
});

router.post('/reorder/:orderId', blockOrderCreationDuringMaintenance, async (req, res, next) => {
  try {
    const order = await commerce.reorder(
      req.auth.id,
      req.params.orderId,
      req.get('Idempotency-Key'),
      { paymentRequired: true }
    );
    try {
      const paymentSession = await directPayment.startOrderPayment(req.auth.id, order._id);
      const body = typeof order.toObject === 'function' ? order.toObject() : order;
      res.status(201).json({ ...body, paymentSession });
    } catch (err) {
      await directPayment.cancelOrderPayment(req.auth.id, order._id).catch(() => {});
      throw err;
    }
  } catch (err) { next(err); }
});

module.exports = router;
