'use strict';

const service = require('../services/adminOrder.service');

async function searchCustomers(req, res, next) {
  try { res.json(await service.searchCustomers(req.query.q)); }
  catch (err) { next(err); }
}

async function preview(req, res, next) {
  try { res.json(await service.preview(req.body, req.auth.id)); }
  catch (err) { next(err); }
}

async function create(req, res, next) {
  try { res.status(201).json(await service.create(req.body, req.auth.id)); }
  catch (err) { next(err); }
}

module.exports = { searchCustomers, preview, create };
