'use strict';
const router = require('express').Router();
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { ROLES } = require('../utils/constants');
const pairing = require('../services/telegramCaptainPairing.service');
const { rateLimit } = require('../middlewares/rateLimit.middleware');
// Service-to-service redemption is deliberately separate from captain JWT routes.
// Use a dedicated high-entropy secret; never expose it to Telegram users.
router.post('/internal/redeem', rateLimit({ windowMs: 60_000, max: 10, namespace: 'telegram-pairing-redeem-v1' }), async (req, res, next) => {
  try {
    const expected = process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
    const supplied = req.get('x-telegram-pairing-secret');
    const { timingSafeEqual } = require('node:crypto');
    if (!expected || expected.length < 32 || !supplied ||
        Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
        !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    const result = await pairing.redeemCode(req.body || {});
    res.set('Cache-Control', 'no-store');
    res.json(result);
  } catch (err) { next(err); }
});
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
