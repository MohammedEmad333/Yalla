'use strict';

const service = require('../services/adminAccess.service');

async function me(req, res, next) {
  try { res.json(await service.accessInfo(req.auth.id)); } catch (err) { next(err); }
}
async function list(req, res, next) {
  try { res.json(await service.listAdmins()); } catch (err) { next(err); }
}
async function create(req, res, next) {
  try { res.status(201).json(await service.createAdmin(req.body)); } catch (err) { next(err); }
}
async function update(req, res, next) {
  try { res.json(await service.updateAdmin(req.auth.id, req.params.adminId, req.body)); } catch (err) { next(err); }
}

module.exports = { me, list, create, update };
