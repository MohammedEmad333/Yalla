'use strict';

const refundService = require('../services/jawwalRefund.service');

async function list(req, res, next) {
  try {
    res.json(await refundService.listRefunds(req.query));
  } catch (err) {
    next(err);
  }
}

async function markRefunded(req, res, next) {
  try {
    res.json(await refundService.markRefunded(req.auth.id, req.params.paymentId, req.body));
  } catch (err) {
    next(err);
  }
}

module.exports = { list, markRefunded };