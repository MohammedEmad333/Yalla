'use strict';
const router = require('express').Router();
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { ROLES } = require('../utils/constants');
const pairing = require('../services/telegramCaptainPairing.service');
const { rateLimit } = require('../middlewares/rateLimit.middleware');
const orders = require('../services/telegramCaptainOrders.service');
const { timingSafeEqual } = require('node:crypto');

// Every internal route is bot-to-backend, authenticated independently of
// captain JWTs. Never include this secret in client applications or logs.
router.use('/internal', (req, res, next) => {
  const expected = process.env.TELEGRAM_PAIRING_BRIDGE_SECRET;
  const supplied = req.get('x-telegram-pairing-secret');
  if (!expected || expected.length < 32 || !supplied ||
      Buffer.byteLength(supplied) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  res.set('Cache-Control', 'no-store');
  next();
});
router.post('/internal/redeem',
  rateLimit({ windowMs: 60_000, max: 10, namespace: 'telegram-pairing-redeem-v1' }),
  async (req, res, next) => {
    try { res.json(await pairing.redeemCode(req.body || {})); }
    catch (err) { next(err); }
  }
);
router.post('/internal/orders',
  rateLimit({ windowMs: 60_000, max: 120, namespace: 'telegram-orders-read-v1' }),
  async (req, res, next) => {
    try { res.json(await orders.listOrdersForTelegram(req.body || {})); }
    catch (err) { next(err); }
  }
);
router.post('/internal/order',
  rateLimit({ windowMs: 60_000, max: 120, namespace: 'telegram-order-read-v1' }),
  async (req, res, next) => {
    try { res.json(await orders.getOrderForTelegram(req.body || {})); }
    catch (err) { next(err); }
  }
);
router.post('/internal/resolve-event',
  rateLimit({ windowMs: 60_000, max: 120, namespace: 'telegram-event-resolve-v1' }),
  async (req, res, next) => {
    try { res.json(await orders.resolveOrderEvent(req.body || {})); }
    catch (err) { next(err); }
  }
);
router.use(authenticate, authorize(ROLES.CAPTAIN));
router.get('/link', async (req, res, next) => {
  try {
    const result = await pairing.getLinkStatus(req.auth.id);
    res.set('Cache-Control', 'no-store');
    res.json(result);
  } catch (err) { next(err); }
});
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
