'use strict';

const router = require('express').Router();
const commerce = require('../services/commerce.service');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { ROLES } = require('../utils/constants');

router.use(authenticate, authorize(ROLES.USER));

router.post('/restaurant-order', async (req, res, next) => {
  try {
    const order = await commerce.placeRestaurantOrder(
      req.auth.id,
      req.body,
      req.get('Idempotency-Key')
    );
    res.status(201).json(order);
  } catch (err) { next(err); }
});

router.post('/reorder/:orderId', async (req, res, next) => {
  try {
    const order = await commerce.reorder(
      req.auth.id,
      req.params.orderId,
      req.get('Idempotency-Key')
    );
    res.status(201).json(order);
  } catch (err) { next(err); }
});

module.exports = router;
