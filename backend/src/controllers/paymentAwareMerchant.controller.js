'use strict';

const merchantService = require('../services/merchant.service');
const refundService = require('../services/jawwalRefund.service');

const branchId = (req) => req.auth?.restaurantId || null;

async function updateOrderStatus(req, res, next) {
  try {
    const order = await merchantService.updateOrderStatus(
      req.auth.id,
      branchId(req),
      req.params.orderId,
      req.body.status,
      req.body.pickupCode
    );
    if (req.body.status === 'rejected') {
      await refundService.markRefundPendingForOrder(req.params.orderId, 'رفض المتجر الطلب');
    }
    res.json(order);
  } catch (err) {
    next(err);
  }
}

module.exports = { updateOrderStatus };
