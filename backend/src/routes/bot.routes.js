'use strict';

const crypto = require('crypto');
const router = require('express').Router();
const User = require('../models/User');
const Order = require('../models/Order');
const Wallet = require('../models/Wallet');

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function phoneCandidates(value) {
  const digits = normalizePhone(value);
  const values = new Set();
  if (!digits) return [];
  values.add(digits);
  values.add('+' + digits);
  if ((digits.startsWith('970') || digits.startsWith('972')) && digits.length >= 11) {
    const local = '0' + digits.slice(3);
    const subscriber = digits.slice(3);
    values.add(local);
    // Palestinian mobile numbers may arrive from WhatsApp/Baileys with either
    // 970 or 972 country-code prefixes. Treat both aliases as the same account.
    values.add('970' + subscriber);
    values.add('+970' + subscriber);
    values.add('972' + subscriber);
    values.add('+972' + subscriber);
  }
  if (digits.startsWith('0')) {
    const subscriber = digits.slice(1);
    values.add('970' + subscriber);
    values.add('+970' + subscriber);
    values.add('972' + subscriber);
    values.add('+972' + subscriber);
  }
  return [...values];
}

function tokenMatches(received, expected) {
  const a = Buffer.from(String(received || ''));
  const b = Buffer.from(String(expected || ''));
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authenticateBot(req, res, next) {
  const expected = String(process.env.BOT_API_TOKEN || '').trim();
  if (!expected) {
    return res.status(503).json({ message: 'Bot integration is not configured' });
  }
  const received = String(req.get('x-yalla-bot-token') || '').trim();
  if (!tokenMatches(received, expected)) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  return next();
}

function publicOrder(order) {
  if (!order) return null;
  return {
    id: String(order._id),
    status: order.status,
    storeName: order.store?.name || '',
    merchantStatus: order.store?.merchantStatus || '',
    etaMinutes: Number(order.etaMinutes || 0),
    deliveryPrice: Number(order.finalPrice || order.price || 0),
    itemsTotal: Number(order.store?.itemsTotal || 0),
    scheduledAt: order.scheduledAt || null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    captainName: order.captain?.name || '',
  };
}

router.use(authenticateBot);

// Read-only, least-privilege context for the WhatsApp support bot.
// Never returns password hashes, OTPs, exact addresses, phone numbers, delivery codes,
// payment details, or captain contact information.
router.get('/customer-context', async (req, res, next) => {
  try {
    const candidates = phoneCandidates(req.query.phone);
    if (!candidates.length) {
      return res.status(400).json({ message: 'phone is required' });
    }

    const user = await User.findOne({ phone: { $in: candidates }, role: 'user', isActive: { $ne: false } })
      .select('_id name lastName')
      .lean();

    if (!user) {
      return res.json({ linked: false, wallet: null, latestOrder: null });
    }

    const [wallet, latestOrder] = await Promise.all([
      Wallet.findOne({ user: user._id }).select('balance reservedBalance currency').lean(),
      Order.findOne({ user: user._id })
        .sort({ createdAt: -1 })
        .select('status store.name store.merchantStatus store.itemsTotal etaMinutes finalPrice price scheduledAt createdAt updatedAt captain')
        .populate('captain', 'name')
        .lean(),
    ]);

    const balance = Number(wallet?.balance || 0);
    const reservedBalance = Math.max(0, Number(wallet?.reservedBalance || 0));

    return res.json({
      linked: true,
      customer: {
        firstName: String(user.name || '').trim(),
      },
      wallet: {
        balance,
        reservedBalance,
        availableBalance: Math.max(0, balance - reservedBalance),
        currency: wallet?.currency || 'ILS',
      },
      latestOrder: publicOrder(latestOrder),
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
