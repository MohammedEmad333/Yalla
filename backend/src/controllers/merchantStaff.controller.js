'use strict';
const service = require('../services/merchantStaff.service');

module.exports = {
  login: async (req, res, next) => { try { res.json(await service.login(req.body.phone, req.body.password)); } catch (err) { next(err); } },
  list: async (req, res, next) => { try { res.json(await service.list(req.auth.id, req.auth)); } catch (err) { next(err); } },
  create: async (req, res, next) => { try { res.status(201).json(await service.create(req.auth.id, req.auth, req.body)); } catch (err) { next(err); } },
  update: async (req, res, next) => { try { res.json(await service.update(req.auth.id, req.auth, req.params.staffId, req.body)); } catch (err) { next(err); } },
  remove: async (req, res, next) => { try { res.json(await service.remove(req.auth.id, req.auth, req.params.staffId)); } catch (err) { next(err); } },
};
