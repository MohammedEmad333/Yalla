'use strict';

const service = require('../services/smartDispatch.service');

async function pending(req, res, next) {
  try { res.json(await service.pendingOrders()); } catch (err) { next(err); }
}
async function recommendations(req, res, next) {
  try { res.json(await service.recommendations(req.params.orderId)); } catch (err) { next(err); }
}
async function assignBest(req, res, next) {
  try { res.json(await service.assignBest(req.auth.id, req.params.orderId)); } catch (err) { next(err); }
}

module.exports = { pending, recommendations, assignBest };
