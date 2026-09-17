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

/**
 * Reserve money for one order without charging it yet.
 * The unique order index makes this idempotent.
 */
async function reserveOrderAmount(userId, orderId, amount) {
  const value = Math.max(0, Number(amount) || 0);
  if (!(value > 0)) {
    return { held: false, duplicate: false, amount: 0 };
  }

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
          {
            $subtract: [
              { $ifNull: ['$balance', 0] },
              { $ifNull: ['$reservedBalance', 0] },
            ],
          },
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

/** Release a hold once when an order is cancelled or successfully delivered. */
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
  releaseOrderHold,
  getOrderHold,
  availableOf,
};
