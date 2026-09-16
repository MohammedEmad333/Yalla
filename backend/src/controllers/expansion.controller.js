'use strict';
const service = require('../services/expansion.service');

const wrap = (fn) => async (req, res, next) => {
  try { res.json(await fn(req, res)); } catch (err) { next(err); }
};

module.exports = {
  rewards: wrap((req) => service.rewards(req.auth.id)),
  applyReferral: wrap((req) => service.applyReferral(req.auth.id, req.body.code)),
  listIssues: wrap((req) => service.listIssues(req.auth.id)),
  createIssue: async (req, res, next) => {
    try { res.status(201).json(await service.createIssue(req.auth.id, req.body)); } catch (err) { next(err); }
  },
  adminIssues: wrap((req) => service.adminIssues(req.query)),
  resolveIssue: wrap((req) => service.resolveIssue(req.auth.id, req.params.issueId, req.body)),
  auditLogs: wrap((req) => service.auditLogs(req.query)),
  systemHealth: wrap(() => service.systemHealth()),
  setMerchandising: wrap((req) => service.setMerchandising(req.auth.id, req.params.restaurantId, req.body)),
};
