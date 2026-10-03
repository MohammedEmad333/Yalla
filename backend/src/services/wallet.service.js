'use strict';

const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const io = require('../sockets/io');
const walletHoldService = require('./walletHold.service');
const {
  ROOMS,
  EVENTS,
  TOPUP_STATUS,
  WALLET_DIRECTION,
  WALLET_TX_TYPE,
} = require('../utils/constants');

/**
 * Legacy customer-wallet ledger compatibility.
 * New orders use direct Jawwal Pay; these helpers remain only for historical
 * wallet-backed orders until their migration/retention window is complete.
 */
function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function availableBalanceOf(wallet) {
  return Math.max(0, Number(wallet?.balance || 0) - Number(wallet?.reservedBalance || 0));
}

async function getOrCreateWallet(userId) {
  return Wallet.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId, balance: 0, reservedBalance: 0, currency: 'ILS' } },
    { new: true, upsert: true }
  );
}

async function getWalletSummary(userId) {
  const wallet = await getOrCreateWallet(userId);
  return {
    balance: Number(wallet.balance || 0),
    reservedBalance: Number(wallet.reservedBalance || 0),
    availableBalance: availableBalanceOf(wallet),
    currency: wallet.currency,
  };
}

async function creditWallet(userId, amount) {
  return Wallet.findOneAndUpdate(
    { user: userId },
    { $inc: { balance: amount } },
    { new: true, upsert: true }
  );
}

async function debitWallet(userId, amount) {
  const value = Number(amount);
  const wallet = await Wallet.findOneAndUpdate(
    {
      user: userId,
      $expr: {
        $gte: [
          { $subtract: [{ $ifNull: ['$balance', 0] }, { $ifNull: ['$reservedBalance', 0] }] },
          value,
        ],
      },
    },
    { $inc: { balance: -value } },
    { new: true }
  );
  if (!wallet) throw httpError('الرصيد المتاح غير كافٍ', 400);
  return wallet;
}

async function chargeForOrder(userId, amount, orderId, breakdown = {}) {
  const value = Number(amount);
  if (!(value > 0)) throw httpError('قيمة الخصم غير صالحة', 400);

  const currentWallet = await getOrCreateWallet(userId);
  let transaction;
  try {
    transaction = await WalletTransaction.create({
      user: userId,
      wallet: currentWallet._id,
      order: orderId,
      type: WALLET_TX_TYPE.ORDER_PAYMENT,
      direction: WALLET_DIRECTION.DEBIT,
      amount: value,
      status: TOPUP_STATUS.APPROVED,
      balanceBefore: currentWallet.balance,
      gatewayResponse: { orderId: String(orderId), ...breakdown },
      idempotencyKey: `order-payment:${orderId}`,
    });
  } catch (err) {
    if (err?.code === 11000) {
      const existing = await WalletTransaction.findOne({
        user: userId,
        idempotencyKey: `order-payment:${orderId}`,
      });
      if (existing && Number(existing.amount) === value && existing.balanceAfter !== null) {
        return existing.balanceAfter;
      }

      const hold = await walletHoldService.getOrderHold(orderId);
      if (existing && hold?.status === 'released' && Number(hold.capturedAmount) === value) {
        const wallet = await getOrCreateWallet(userId);
        existing.balanceAfter = wallet.balance;
        await existing.save();
        return wallet.balance;
      }
      throw httpError('دفعة هذا الطلب قيد المعالجة', 409);
    }
    throw err;
  }

  let wallet;
  let capturedHold = false;
  try {
    const hold = await walletHoldService.getOrderHold(orderId);
    if (hold) {
      const capture = await walletHoldService.captureOrderHold(userId, orderId, value);
      if (capture.captured) {
        capturedHold = true;
        wallet = capture.wallet || (await getOrCreateWallet(userId));
      } else if (capture.noHold) {
        wallet = await debitWallet(userId, value);
      } else {
        throw httpError('تعذّر تسوية حجز هذا الطلب', 409);
      }
    } else {
      wallet = await debitWallet(userId, value);
    }
  } catch (err) {
    await WalletTransaction.deleteOne({ _id: transaction._id }).catch(() => {});
    throw err;
  }

  transaction.balanceAfter = wallet.balance;
  await transaction.save();

  if (!capturedHold) broadcastBalance(userId, wallet.balance);
  return wallet.balance;
}

async function refundOrderPayment(userId, orderId, reason = '') {
  const payment = await WalletTransaction.findOne({
    user: userId,
    idempotencyKey: `order-payment:${orderId}`,
    status: TOPUP_STATUS.APPROVED,
  });
  if (!payment) return { refunded: false, amount: 0 };

  const key = `order-refund:${orderId}`;
  const previous = await WalletTransaction.findOne({ user: userId, idempotencyKey: key }).lean();
  if (previous) {
    return { refunded: true, amount: previous.amount, balance: previous.balanceAfter, duplicate: true };
  }

  const currentWallet = await getOrCreateWallet(userId);
  let transaction;
  try {
    transaction = await WalletTransaction.create({
      user: userId,
      wallet: currentWallet._id,
      order: orderId,
      type: WALLET_TX_TYPE.REFUND,
      direction: WALLET_DIRECTION.CREDIT,
      amount: payment.amount,
      status: TOPUP_STATUS.APPROVED,
      balanceBefore: currentWallet.balance,
      gatewayResponse: { orderId: String(orderId), reason },
      idempotencyKey: key,
    });
  } catch (err) {
    if (err?.code === 11000) {
      const existing = await WalletTransaction.findOne({ user: userId, idempotencyKey: key }).lean();
      return { refunded: true, amount: existing.amount, balance: existing.balanceAfter, duplicate: true };
    }
    throw err;
  }

  try {
    const wallet = await creditWallet(userId, payment.amount);
    transaction.balanceAfter = wallet.balance;
    await transaction.save();
    broadcastBalance(userId, wallet.balance);
    return { refunded: true, amount: payment.amount, balance: wallet.balance };
  } catch (err) {
    await WalletTransaction.deleteOne({ _id: transaction._id }).catch(() => {});
    throw err;
  }
}

function broadcastBalance(userId, balance) {
  try {
    io.get().to(ROOMS.user(String(userId))).emit(EVENTS.WALLET_UPDATED, { balance });
  } catch (_) {
    // Socket.io is not initialized in some tests.
  }
}

async function listUserTransactions(userId, { limit = 20, skip = 0, status } = {}) {
  const filter = { user: userId };
  if (status) filter.status = status;
  return WalletTransaction.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

async function getUserWalletForAdmin(userId) {
  const [summary, transactions] = await Promise.all([
    getWalletSummary(userId),
    listUserTransactions(userId, { limit: 20 }),
  ]);
  return { ...summary, transactions };
}

module.exports = {
  getOrCreateWallet,
  getWalletSummary,
  creditWallet,
  debitWallet,
  chargeForOrder,
  refundOrderPayment,
  broadcastBalance,
  listUserTransactions,
  getUserWalletForAdmin,
};
