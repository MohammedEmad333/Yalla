'use strict';

const orderService = require('../services/order.service');
const refundService = require('../services/jawwalRefund.service');
const { ORDER_STATUS } = require('../utils/constants');

async function cancelOrder(req, res, next) {
  try {
    const { orderId } = req.params;
    const { reason } = req.body || {};
    const order = await orderService.cancelOrder(
      orderId,
      { actorId: req.auth.id, actorRole: req.auth.role },
      reason
    );
    await refundService.markRefundPendingForOrder(
      orderId,
      reason || (req.auth.role === 'admin' ? 'إلغاء من الأدمن' : 'إلغاء من المستخدم')
    );
    res.json(await orderService.getOrderForTracking(orderId, req.auth.id, req.auth.role).catch(() => order));
  } catch (err) {
    next(err);
  }
}

async function updateStatus(req, res, next) {
  try {
    const { orderId } = req.params;
    const { status, reason, deliveryCode, finalPrice } = req.body || {};
    const order = await orderService.updateOrderStatus(
      req.auth.id,
      orderId,
      status,
      reason,
      deliveryCode,
      finalPrice
    );
    if (order?.status === ORDER_STATUS.CANCELLED) {
      await refundService.markRefundPendingForOrder(orderId, reason || 'إلغاء من الكابتن');
    }
    res.json(order);
  } catch (err) {
    next(err);
  }
}

module.exports = { cancelOrder, updateStatus };
