'use strict';
const router = require('express').Router();
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { ROLES } = require('../utils/constants');
const pairing = require('../services/telegramCaptainPairing.service');
router.use(authenticate, authorize(ROLES.CAPTAIN));
router.post('/pairing-code', async (req, res, next) => {
  try {
    const result = await pairing.issueCode(req.auth.id);
    res.set('Cache-Control', 'no-store');
    res.json(result);
  } catch (err) { next(err); }
});
router.delete('/link', async (req, res, next) => {
  try { await pairing.unlink(req.auth.id); res.status(204).end(); }
  catch (err) { next(err); }
});
module.exports = router;
