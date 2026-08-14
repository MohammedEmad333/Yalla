'use strict';

const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const io = require('../sockets/io');
const logger = require('../utils/logger');
const notifications = require('./notification.service');
const { canTransition } = require('../utils/topup');
const {
  ROLES,
  ROOMS,
  EVENTS,
  TOPUP_STATUS,
  WALLET_DIRECTION,
  WALLET_TX_TYPE,
} = require('../utils/constants');

/**
 * طبقة خدمة المحفظة — منطق الرصيد ودفتر الحركات، مستقلّة تمامًا عن
 * طريقة الدفع (تلك يتكفّل بها نمط الاستراتيجية في services/payment).
 * كل تعديل على الرصيد يتمّ ذرّيًّا ($inc) لتفادي حالات السباق.
 */

// خطأ برمز حالة HTTP (يتوافق مع معالج الأخطاء المركزي)
function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

/** جلب محفظة المستخدم أو إنشاؤها إن لم تكن موجودة. */
async function getOrCreateWallet(userId) {
  const wallet = await Wallet.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId, balance: 0, currency: 'ILS' } },
    { new: true, upsert: true }
  );
  return wallet;
}

/** ملخّص المحفظة للمستخدم (الرصيد + العملة). */
async function getWalletSummary(userId) {
  const wallet = await getOrCreateWallet(userId);
  return { balance: wallet.balance, currency: wallet.currency };
}

/** إضافة رصيد ذرّيًّا وإرجاع الرصيد الجديد. */
async function creditWallet(userId, amount) {
  const wallet = await Wallet.findOneAndUpdate(
    { user: userId },
    { $inc: { balance: amount } },
    { new: true, upsert: true }
  );
  return wallet;
}

/**
 * خصم رصيد ذرّيًّا بشرط كفايته (يمنع الرصيد السالب).
 * يُستخدم لاحقًا لدفع قيمة الطلبات من المحفظة.
 * @returns {Promise<import('mongoose').Document>} المحفظة بعد الخصم
 */
async function debitWallet(userId, amount) {
  const wallet = await Wallet.findOneAndUpdate(
    { user: userId, balance: { $gte: amount } }, // الشرط يضمن عدم النزول تحت الصفر
    { $inc: { balance: -amount } },
    { new: true }
  );
  if (!wallet) throw httpError('الرصيد غير كافٍ', 400);
  return wallet;
}

/** بثّ الرصيد المحدّث لحظيًا لصاحب المحفظة. */
function broadcastBalance(userId, balance) {
  try {
    io.get().to(ROOMS.user(String(userId))).emit(EVENTS.WALLET_UPDATED, { balance });
  } catch (_) {
    // السوكت غير مهيّأ (اختبارات) — تجاهل بأمان
  }
}

// ── حركات الشحن (Top-up) ─────────────────────────────────────────

/** إنشاء حركة شحن في دفتر الأستاذ (تستدعيها استراتيجيات الدفع). */
async function createTopupTransaction({
  userId,
  amount,
  method,
  status = TOPUP_STATUS.PENDING,
  proof = {},
  gatewayResponse = null,
  idempotencyKey,
}) {
  const wallet = await getOrCreateWallet(userId);

  // منع التكرار: نفس المفتاح يُعيد الحركة الأصلية
  if (idempotencyKey) {
    const existing = await WalletTransaction.findOne({ user: userId, idempotencyKey });
    if (existing) return existing;
  }

  const tx = await WalletTransaction.create({
    user: userId,
    wallet: wallet._id,
    type: WALLET_TX_TYPE.TOPUP,
    direction: WALLET_DIRECTION.CREDIT,
    amount,
    method,
    status,
    proof,
    gatewayResponse,
    idempotencyKey,
  });

  // الأدمن يراجع الطلبات المعلّقة من قائمة "قيد المراجعة" في اللوحة، ونبثّها
  // لحظيًا لغرفة الأدمن ليظهر الطلب فور وصوله (اختياري — لا يوقف التدفّق).
  if (status === TOPUP_STATUS.PENDING) {
    try {
      io.get().to(ROOMS.admins()).emit(EVENTS.WALLET_UPDATED, {
        type: 'WALLET_TOPUP_PENDING',
        transactionId: String(tx._id),
        amount,
      });
    } catch (_) {
      // السوكت غير مهيّأ (اختبارات) — تجاهل بأمان
    }
  }

  return tx;
}

/** قائمة حركات مستخدم (اختياريًّا بحسب الحالة). */
async function listUserTransactions(userId, { limit = 20, skip = 0, status } = {}) {
  const filter = { user: userId };
  if (status) filter.status = status;
  return WalletTransaction.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();
}

// ── مراجعة الأدمن ────────────────────────────────────────────────

/** قائمة طلبات الشحن للوحة الأدمن (افتراضيًّا المعلّقة). */
async function listTopups({ status = TOPUP_STATUS.PENDING, limit = 50, skip = 0 } = {}) {
  const filter = { type: WALLET_TX_TYPE.TOPUP };
  if (status && status !== 'all') filter.status = status;
  return WalletTransaction.find(filter)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('user', 'name lastName phone')
    .lean();
}

/**
 * موافقة الأدمن على طلب شحن → إضافة الرصيد للمحفظة.
 * ذرّي وآمن ضدّ التكرار: نُطالب أوّلًا بتحويل الحالة pending→approved
 * (findOneAndUpdate مشروط)، فإن نجح فقط نضيف الرصيد.
 */
async function approveTopup(adminId, txId, note = '') {
  const tx = await WalletTransaction.findById(txId);
  if (!tx) throw httpError('عملية الشحن غير موجودة', 404);
  if (!canTransition(tx.status, TOPUP_STATUS.APPROVED)) {
    throw httpError('لا يمكن الموافقة على هذه العملية (حالتها ليست معلّقة)', 409);
  }

  // مطالبة ذرّية بالعملية (تمنع الموافقة المزدوجة تحت التزامن)
  const claimed = await WalletTransaction.findOneAndUpdate(
    { _id: txId, status: TOPUP_STATUS.PENDING },
    {
      status: TOPUP_STATUS.APPROVED,
      review: { by: adminId, at: new Date(), note },
    },
    { new: true }
  );
  if (!claimed) throw httpError('العملية عولجت بالفعل', 409);

  // أُضيف الرصيد فقط بعد ضمان المطالبة الذرّية بالعملية
  const wallet = await creditWallet(claimed.user, claimed.amount);
  claimed.balanceAfter = wallet.balance;
  await claimed.save();

  // إشعار المستخدم + بثّ الرصيد الجديد لحظيًا
  await notifications.createInApp(claimed.user, ROLES.USER, {
    title: '✅ تمّ شحن رصيدك',
    body: `أُضيف ${claimed.amount} ₪ إلى محفظتك. رصيدك الآن ${wallet.balance} ₪`,
    data: { type: 'WALLET_TOPUP_APPROVED', transactionId: String(claimed._id) },
  }).catch(() => {});
  broadcastBalance(claimed.user, wallet.balance);

  return { transaction: claimed, balance: wallet.balance };
}

/** رفض الأدمن لطلب شحن (لا يُضاف رصيد). */
async function rejectTopup(adminId, txId, reason = '') {
  const tx = await WalletTransaction.findById(txId);
  if (!tx) throw httpError('عملية الشحن غير موجودة', 404);
  if (!canTransition(tx.status, TOPUP_STATUS.REJECTED)) {
    throw httpError('لا يمكن رفض هذه العملية (حالتها ليست معلّقة)', 409);
  }

  const rejected = await WalletTransaction.findOneAndUpdate(
    { _id: txId, status: TOPUP_STATUS.PENDING },
    {
      status: TOPUP_STATUS.REJECTED,
      rejectionReason: reason,
      review: { by: adminId, at: new Date(), note: reason },
    },
    { new: true }
  );
  if (!rejected) throw httpError('العملية عولجت بالفعل', 409);

  await notifications.createInApp(rejected.user, ROLES.USER, {
    title: '⚠️ رُفض طلب الشحن',
    body: reason || 'تعذّر تأكيد التحويل. تواصل مع الدعم إن كان لديك استفسار.',
    data: { type: 'WALLET_TOPUP_REJECTED', transactionId: String(rejected._id) },
  }).catch(() => {});

  return { transaction: rejected };
}

/** لوحة الأدمن: محفظة مستخدم معيّن + آخر حركاته. */
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
  createTopupTransaction,
  listUserTransactions,
  listTopups,
  approveTopup,
  rejectTopup,
  getUserWalletForAdmin,
};
