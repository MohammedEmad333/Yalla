'use strict';

const walletService = require('../services/wallet.service');
const paymentService = require('../services/payment');
const { publicUrlFor } = require('../middlewares/upload.middleware');

/**
 * متحكّمات محفظة المستخدم — طبقة HTTP رفيعة تفوّض للخدمات.
 */

// GET /wallet — رصيد المستخدم الحالي
async function getWallet(req, res, next) {
  try {
    const summary = await walletService.getWalletSummary(req.auth.id);
    res.json(summary);
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

    // صورة الإيصال (اختيارية إن اكتُفي برقم العملية) — يرفعها multer
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

    res.status(201).json(tx);
  } catch (err) {
    next(err);
  }
}

module.exports = { getWallet, getMethods, getTransactions, requestTopup };
