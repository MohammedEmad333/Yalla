'use strict';

const Wallet = require('../models/Wallet');
const WalletHold = require('../models/WalletHold');
const io = require('../sockets/io');
const { ROOMS, EVENTS } = require('../utils/constants');

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function availableOf(wallet) {
  return Math.max(0, Number(wallet?.balance || 0) - Number(wallet?.reservedBalance || 0));
}

async function getOrCreateWallet(userId) {
  return Wallet.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId, balance: 0, reservedBalance: 0, currency: 'ILS' } },
    { new: true, upsert: true }
  );
}

function broadcastWallet(userId, wallet) {
  try {
    io.get().to(ROOMS.user(String(userId))).emit(EVENTS.WALLET_UPDATED, {
      balance: Number(wallet.balance || 0),
      reservedBalance: Number(wallet.reservedBalance || 0),
      availableBalance: availableOf(wallet),
    });
  } catch (_) {
    // Socket.io may be unavailable in unit tests.
  }
}

async function reserveOrderAmount(userId, orderId, amount) {
  const value = Math.max(0, Number(amount) || 0);
  if (!(value > 0)) return { held: false, duplicate: false, amount: 0 };

  const existing = await WalletHold.findOne({ order: orderId });
  if (existing) {
    return {
      held: existing.status === 'active',
      duplicate: true,
      amount: existing.amount,
      status: existing.status,
    };
  }

  const wallet = await getOrCreateWallet(userId);
  let hold;
  try {
    hold = await WalletHold.create({
      user: userId,
      wallet: wallet._id,
      order: orderId,
      amount: value,
      status: 'reserving',
      reason: 'order',
    });
  } catch (err) {
    if (err?.code === 11000) {
      const duplicate = await WalletHold.findOne({ order: orderId }).lean();
      return {
        held: duplicate?.status === 'active',
        duplicate: true,
        amount: Number(duplicate?.amount) || value,
        status: duplicate?.status,
      };
    }
    throw err;
  }

  const reservedWallet = await Wallet.findOneAndUpdate(
    {
      _id: wallet._id,
      $expr: {
        $gte: [
          { $subtract: [{ $ifNull: ['$balance', 0] }, { $ifNull: ['$reservedBalance', 0] }] },
          value,
        ],
      },
    },
    { $inc: { reservedBalance: value } },
    { new: true }
  );

  if (!reservedWallet) {
    await WalletHold.deleteOne({ _id: hold._id }).catch(() => {});
    const latest = await getOrCreateWallet(userId);
    const available = availableOf(latest);
    throw httpError(
      `الرصيد المتاح غير كافٍ لإتمام الطلب: المتاح ${available} ₪ والمطلوب ${value} ₪. لديك مبالغ محجوزة لطلبات أخرى.`,
      400
    );
  }

  hold.status = 'active';
  await hold.save();
  broadcastWallet(userId, reservedWallet);

  return {
    held: true,
    duplicate: false,
    amount: value,
    balance: Number(reservedWallet.balance || 0),
    reservedBalance: Number(reservedWallet.reservedBalance || 0),
    availableBalance: availableOf(reservedWallet),
  };
}

/**
 * Capture a store-order hold: charge the actual amount and release the entire estimate in one wallet update.
 * If the actual charge is less than the estimate, the difference simply becomes available again.
 */
async function captureOrderHold(userId, orderId, amount) {
  const value = Number(amount);
  if (!(value > 0)) throw httpError('قيمة الخصم غير صالحة', 400);

  const hold = await WalletHold.findOneAndUpdate(
    { order: orderId, user: userId, status: 'active' },
    { $set: { status: 'capturing' } },
    { new: true }
  );

  if (!hold) {
    const existing = await WalletHold.findOne({ order: orderId, user: userId }).lean();
    if (existing?.status === 'released' && Number(existing.capturedAmount) === value) {
      const wallet = await getOrCreateWallet(userId);
      return { captured: true, duplicate: true, balance: wallet.balance, wallet };
    }
    if (existing?.status === 'capturing') throw httpError('دفعة هذا الطلب قيد المعالجة', 409);
    return { captured: false, noHold: true };
  }

  const extraNeeded = Math.max(0, value - Number(hold.amount || 0));
  try {
    const wallet = await Wallet.findOneAndUpdate(
      {
        _id: hold.wallet,
        balance: { $gte: value },
        reservedBalance: { $gte: hold.amount },
        $expr: {
          $gte: [
            { $subtract: [{ $ifNull: ['$balance', 0] }, { $ifNull: ['$reservedBalance', 0] }] },
            extraNeeded,
          ],
        },
      },
      {
        $inc: {
          balance: -value,
          reservedBalance: -Number(hold.amount || 0),
        },
      },
      { new: true }
    );

    if (!wallet) throw httpError('الرصيد المتاح غير كافٍ لإتمام تسوية الطلب', 400);

    hold.status = 'released';
    hold.capturedAmount = value;
    hold.releasedAt = new Date();
    hold.releaseReason = 'captured';
    await hold.save();
    broadcastWallet(userId, wallet);

    return {
      captured: true,
      duplicate: false,
      amount: value,
      heldAmount: hold.amount,
      balance: wallet.balance,
      reservedBalance: wallet.reservedBalance,
      availableBalance: availableOf(wallet),
      wallet,
    };
  } catch (err) {
    await WalletHold.updateOne(
      { _id: hold._id, status: 'capturing' },
      { $set: { status: 'active' } }
    ).catch(() => {});
    throw err;
  }
}

async function releaseOrderHold(orderId, reason = '') {
  const hold = await WalletHold.findOneAndUpdate(
    { order: orderId, status: 'active' },
    { $set: { status: 'releasing', releaseReason: String(reason || '') } },
    { new: true }
  );

  if (!hold) {
    const existing = await WalletHold.findOne({ order: orderId }).lean();
    return {
      released: existing?.status === 'released',
      duplicate: !!existing,
      amount: Number(existing?.amount) || 0,
    };
  }

  try {
    const wallet = await Wallet.findOneAndUpdate(
      { _id: hold.wallet, reservedBalance: { $gte: hold.amount } },
      { $inc: { reservedBalance: -hold.amount } },
      { new: true }
    );
    if (!wallet) throw httpError('تعذّر تحرير حجز المحفظة', 409);

    hold.status = 'released';
    hold.releasedAt = new Date();
    await hold.save();
    broadcastWallet(hold.user, wallet);

    return {
      released: true,
      duplicate: false,
      amount: hold.amount,
      availableBalance: availableOf(wallet),
    };
  } catch (err) {
    await WalletHold.updateOne(
      { _id: hold._id, status: 'releasing' },
      { $set: { status: 'active' } }
    ).catch(() => {});
    throw err;
  }
}

async function getOrderHold(orderId) {
  return WalletHold.findOne({ order: orderId }).lean();
}

module.exports = {
  reserveOrderAmount,
  captureOrderHold,
  releaseOrderHold,
  getOrderHold,
  availableOf,
};
