'use strict';

const orderService = require('../services/order.service');
const directPayment = require('../services/directPayment.service');

// إنشاء طلب التوصيل وبدء الدفع على رقم المحفظة الذي أدخله المستخدم.
// إبقاء المنطق في Controller صغير مستقل يقلّل مخاطر تغيير بقية order.controller.
async function createOrder(req, res, next) {
  try {
    const idempotencyKey = req.get('Idempotency-Key');
    const order = await orderService.createOrder(
      req.auth.id,
      req.body,
      idempotencyKey,
      { paymentRequired: true }
    );

    try {
      const paymentSession = await directPayment.startOrderPayment(
        req.auth.id,
        order._id,
        req.body?.paymentPhone
      );
      const body = typeof order.toObject === 'function' ? order.toObject() : order;
      res.status(201).json({ ...body, paymentSession });
    } catch (err) {
      await directPayment.cancelOrderPayment(req.auth.id, order._id).catch(() => {});
      throw err;
    }
  } catch (err) {
    next(err);
  }
}

module.exports = { createOrder };
