'use strict';

const branches = require('../services/merchantBranch.service');

async function list(req, res, next) {
  try { res.json(await branches.list(req.auth.id)); } catch (err) { next(err); }
}
async function create(req, res, next) {
  try { res.status(201).json(await branches.create(req.auth.id, req.auth, req.body)); } catch (err) { next(err); }
}
async function select(req, res, next) {
  try { res.json(await branches.select(req.auth.id, req.auth, req.params.restaurantId)); } catch (err) { next(err); }
}
async function detach(req, res, next) {
  try { res.json(await branches.detach(req.auth.id, req.auth, req.params.restaurantId)); } catch (err) { next(err); }
}

module.exports = { list, create, select, detach };
