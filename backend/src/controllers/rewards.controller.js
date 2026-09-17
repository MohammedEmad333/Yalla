'use strict';

const service = require('../services/rewards.service');

const wrap = (fn) => async (req, res, next) => {
  try { res.json(await fn(req, res)); } catch (err) { next(err); }
};

module.exports = {
  rewards: wrap((req) => service.getRewards(req.auth.id)),
  applyReferral: wrap((req) => service.applyReferral(req.auth.id, req.body.code)),
  redeem: wrap((req) => service.redeem(req.auth.id, req.body.points)),
  adminSettings: wrap(() => service.getAdminSettings()),
  updateAdminSettings: wrap((req) => service.updateAdminSettings(req.body)),
};
