'use strict';

const directPayment = require('../services/directPayment.service');

async function start(req, res, next) {
  try {
    res.status(201).json(
      await directPayment.startOrderPayment(
        req.auth.id,
        req.params.orderId,
        req.body?.paymentPhone ?? req.body?.phone
      )
    );
  } catch (err) { next(err); }
}

async function confirm(req, res, next) {
  try {
    res.json(await directPayment.confirmOrderPayment(req.auth.id, req.params.orderId, req.body?.otp));
  } catch (err) { next(err); }
}

async function cancel(req, res, next) {
  try {
    res.json(await directPayment.cancelOrderPayment(req.auth.id, req.params.orderId));
  } catch (err) { next(err); }
}

async function status(req, res, next) {
  try {
    res.json(await directPayment.getOrderPayment(req.auth.id, req.params.orderId));
  } catch (err) { next(err); }
}

module.exports = { start, confirm, cancel, status };
