'use strict';

const walletService = require('../services/wallet.service');
const paymentService = require('../services/payment');
const customerWithdrawalService = require('../services/customerWithdrawal.service');
const notifications = require('../services/notification.service');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const logger = require('../utils/logger');
const { publicUrlFor } = require('../middlewares/upload.middleware');

/**
 * متحكّمات محفظة المستخدم — طبقة HTTP رفيعة تفوّض للخدمات.
 */

// GET /wallet — الرصيد الفعلي + المحجوز + المتاح للمستخدم.
async function getWallet(req, res, next) {
  try {
    const summary = await walletService.getWalletSummary(req.auth.id);
    const wallet = await Wallet.findOne({ user: req.auth.id }).lean();
    const reservedBalance = Math.max(0, Number(wallet?.reservedBalance || 0));
    const balance = Number(summary.balance || 0);
    res.json({
      ...summary,
      balance,
      reservedBalance,
      availableBalance: Math.max(0, balance - reservedBalance),
    });
  } catch (err) {
    next(err);
  }
}

// GET /wallet/methods — طرق الشحن المتاحة (بيانات الحساب + التعليمات)
async function getMethods(req, res, next) {
  try {
    res.json(paymentService.getAvailableMethods());
  } catch (err) {
    next(err);
  }
}

// GET /wallet/transactions — سجلّ حركات المستخدم (?status=&limit=&skip=)
async function getTransactions(req, res, next) {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = parseInt(req.query.skip, 10) || 0;
    const items = await walletService.listUserTransactions(req.auth.id, {
      limit,
      skip,
      status: req.query.status,
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
}

// POST /wallet/topup — طلب شحن رصيد (multipart: صورة الإيصال + حقول)
// المرحلة 1: يُنشئ حركة معلّقة بانتظار موافقة الأدمن.
async function requestTopup(req, res, next) {
  try {
    const { method, amount, referenceNumber, senderName, paidAt } = req.body;

    const imageUrl = req.file ? publicUrlFor(req.file.filename) : '';

    const tx = await paymentService.requestTopUp({
      userId: req.auth.id,
      method,
      amount,
      proof: {
        imageUrl,
        referenceNumber: referenceNumber || '',
        senderName: senderName || '',
        paidAt: paidAt ? new Date(paidAt) : null,
      },
      idempotencyKey: req.get('Idempotency-Key') || undefined,
    });

    User.findById(req.auth.id)
      .select('name lastName')
      .lean()
      .then((u) => {
        const name = u ? [u.name, u.lastName].filter(Boolean).join(' ').trim() : '';
        return notifications.notifyAdmins(
          notifications.topupRequestAdminPayload({ name, amount, method })
        );
      })
      .catch((e) => logger.warn('تعذّر إشعار المشرفين بطلب الشحن:', e.message));

    res.status(201).json(tx);
  } catch (err) {
    next(err);
  }
}

// ── سحب رصيد الزبون ─────────────────────────────────────────────

async function getWithdrawAvailability(req, res, next) {
  try {
    const [available, activeOrder, wallet] = await Promise.all([
      customerWithdrawalService.getAvailable(req.auth.id),
      customerWithdrawalService.hasActiveOrder(req.auth.id),
      Wallet.findOne({ user: req.auth.id }).lean(),
    ]);
    const reservedBalance = Math.max(0, Number(wallet?.reservedBalance || 0));
    const availableAfterHolds = Math.max(0, Number(available.available || 0) - reservedBalance);
    res.json({
      ...available,
      reservedBalance,
      available: availableAfterHolds,
      hasActiveOrder: activeOrder,
    });
  } catch (err) {
    next(err);
  }
}

async function listMyWithdrawals(req, res, next) {
  try {
    const items = await customerWithdrawalService.listMine(req.auth.id, {
      limit: parseInt(req.query.limit, 10) || 30,
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
}

async function requestWithdrawal(req, res, next) {
  try {
    const { amount, destination, accountNumber, accountOwner, note } = req.body;
    const withdrawal = await customerWithdrawalService.requestWithdrawal(req.auth.id, {
      amount,
      destination,
      accountNumber,
      accountOwner,
      note,
    });
    res.status(201).json(withdrawal);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getWallet,
  getMethods,
  getTransactions,
  requestTopup,
  getWithdrawAvailability,
  listMyWithdrawals,
  requestWithdrawal,
};
