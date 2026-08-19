'use strict';

const mongoose = require('mongoose');
const User = require('../models/User');
const Captain = require('../models/Captain');
const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const CaptainWithdrawal = require('../models/CaptainWithdrawal');
const Notification = require('../models/Notification');
const SupportMessage = require('../models/SupportMessage');
const Order = require('../models/Order');
const Log = require('../models/Log');
const io = require('../sockets/io');
const logger = require('../utils/logger');
const { computeCaptainBalance } = require('../utils/withdrawal');
const { ORDER_STATUS, ROLES, ROOMS, EVENTS } = require('../utils/constants');

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

// حالات الطلب النشطة (غير المنتهية) — تمنع حذف الزبون/الكابتن أثناءها
const ACTIVE_STATUSES = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.ASSIGNED,
  ORDER_STATUS.ACCEPTED,
  ORDER_STATUS.PICKED_UP,
];

/**
 * Card 41: قائمة الزبائن بكل المعلومات المطلوبة —
 * الرقم والاسم والعنوان والرصيد المتوفّر وتاريخ الانضمام.
 * @param {{q?:string}} opts
 */
async function listCustomers({ q } = {}) {
  const filter = { role: ROLES.USER };
  if (q) {
    filter.$or = [{ name: new RegExp(q, 'i') }, { phone: new RegExp(q, 'i') }];
  }
  const users = await User.find(filter)
    .select('name lastName phone email city isActive createdAt')
    .sort({ createdAt: -1 })
    .lean();

  // رصيد كل زبون من محفظته (استعلام واحد)
  const wallets = await Wallet.find({
    user: { $in: users.map((u) => u._id) },
  })
    .select('user balance')
    .lean();
  const balanceByUser = new Map(wallets.map((w) => [String(w.user), w.balance]));

  return users.map((u) => ({
    id: String(u._id),
    name: [u.name, u.lastName].filter(Boolean).join(' ').trim() || u.name,
    phone: u.phone,
    email: u.email || '',
    address: u.city || '',
    balance: balanceByUser.get(String(u._id)) || 0,
    isActive: u.isActive,
    createdAt: u.createdAt,
  }));
}

/**
 * Card 37 + Card 41: قائمة الكباتن بكل المعلومات — بما فيها الرصيد القابل للسحب.
 * الرصيد المتاح = صافي أرباح الطلبات المسلّمة − (المسحوب فعلًا + المعلّق).
 */
async function listCaptainsDetailed() {
  const captains = await Captain.find()
    .select('name phone vehicleType vehiclePlate status isApproved rating ratingsCount avatarUrl activeOrder createdAt')
    .sort({ createdAt: -1 })
    .lean();
  if (!captains.length) return [];

  const ids = captains.map((c) => c._id);

  // صافي أرباح كل كابتن من الطلبات المسلّمة (تجميع واحد)
  const earnedAgg = await Order.aggregate([
    { $match: { captain: { $in: ids }, status: ORDER_STATUS.DELIVERED } },
    { $group: { _id: '$captain', net: { $sum: '$captainNet' } } },
  ]);
  const earnedByCaptain = new Map(earnedAgg.map((r) => [String(r._id), r.net]));

  // طلبات السحب لكل كابتن (لحساب المسحوب/المعلّق)
  const withdrawals = await CaptainWithdrawal.find({ captain: { $in: ids } })
    .select('captain amount status')
    .lean();
  const wByCaptain = new Map();
  for (const w of withdrawals) {
    const k = String(w.captain);
    if (!wByCaptain.has(k)) wByCaptain.set(k, []);
    wByCaptain.get(k).push(w);
  }

  return captains.map((c) => {
    const balance = computeCaptainBalance(
      earnedByCaptain.get(String(c._id)) || 0,
      wByCaptain.get(String(c._id)) || []
    );
    return {
      id: String(c._id),
      name: c.name,
      phone: c.phone,
      vehicleType: c.vehicleType,
      vehiclePlate: c.vehiclePlate || '',
      status: c.status,
      online: c.status === 'online',
      busy: c.status === 'busy' || !!c.activeOrder,
      isApproved: c.isApproved,
      rating: c.rating,
      ratingsCount: c.ratingsCount,
      avatarUrl: c.avatarUrl || '',
      earned: balance.earned,
      withdrawn: balance.done,
      pending: balance.pending,
      balance: balance.available, // الرصيد المتوفّر للسحب
      createdAt: c.createdAt,
    };
  });
}

/**
 * Card 38: حذف زبون نهائيًا من الذاكرة مع بياناته المرتبطة.
 * يُمنع الحذف إن كان لديه طلب نشط (غير منتهٍ) لتفادي فقدان طلب جارٍ.
 * @param {string} userId
 * @param {'admin'|'user'} actorRole  من نفّذ الحذف — أدمن أو الزبون نفسه (حذف ذاتي).
 */
async function deleteUser(userId, actorRole = 'admin') {
  if (!mongoose.Types.ObjectId.isValid(userId)) throw httpError('معرّف غير صالح', 400);
  const user = await User.findById(userId).select('name role');
  if (!user) throw httpError('المستخدم غير موجود', 404);
  if (user.role === ROLES.ADMIN) throw httpError('لا يمكن حذف حساب أدمن', 400);

  const active = await Order.countDocuments({ user: userId, status: { $in: ACTIVE_STATUSES } });
  if (active > 0) {
    throw httpError('لا يمكن حذف الزبون: لديه طلب نشط قيد التنفيذ', 409);
  }

  // حذف البيانات المرتبطة (المحفظة، حركاتها، الإشعارات، رسائل الدعم) ثم الحساب
  await Promise.all([
    Wallet.deleteMany({ user: userId }),
    WalletTransaction.deleteMany({ user: userId }),
    Notification.deleteMany({ recipient: userId }),
    SupportMessage.deleteMany({ user: userId }),
  ]);
  await User.deleteOne({ _id: userId });

  await Log.create({
    actorRole,
    action: 'USER_DELETED',
    meta: { userId: String(userId), name: user.name, self: actorRole === 'user' },
  });

  try {
    io.get().to(ROOMS.admins()).emit(EVENTS.USER_DELETED, { id: String(userId) });
  } catch (_) {
    /* السوكت غير مهيّأ */
  }

  return { deleted: true, id: String(userId) };
}

/**
 * Card 38: حذف كابتن نهائيًا من الذاكرة مع بياناته المرتبطة.
 * يُمنع الحذف إن كان مشغولًا بطلب نشط.
 * @param {string} captainId
 * @param {'admin'|'captain'} actorRole  من نفّذ الحذف — أدمن أو الكابتن نفسه (حذف ذاتي).
 */
async function deleteCaptain(captainId, actorRole = 'admin') {
  if (!mongoose.Types.ObjectId.isValid(captainId)) throw httpError('معرّف غير صالح', 400);
  const captain = await Captain.findById(captainId).select('name activeOrder');
  if (!captain) throw httpError('الكابتن غير موجود', 404);

  const active = await Order.countDocuments({
    captain: captainId,
    status: { $in: ACTIVE_STATUSES },
  });
  if (captain.activeOrder || active > 0) {
    throw httpError('لا يمكن حذف الكابتن: لديه طلب نشط قيد التنفيذ', 409);
  }

  await Promise.all([
    CaptainWithdrawal.deleteMany({ captain: captainId }),
    Notification.deleteMany({ recipient: captainId }),
  ]);
  await Captain.deleteOne({ _id: captainId });

  await Log.create({
    actorRole,
    action: 'CAPTAIN_DELETED',
    meta: { captainId: String(captainId), name: captain.name, self: actorRole === 'captain' },
  });

  try {
    io.get().to(ROOMS.admins()).emit(EVENTS.CAPTAIN_DELETED, { id: String(captainId) });
  } catch (_) {
    /* السوكت غير مهيّأ */
  }

  return { deleted: true, id: String(captainId) };
}

module.exports = { listCustomers, listCaptainsDetailed, deleteUser, deleteCaptain };
