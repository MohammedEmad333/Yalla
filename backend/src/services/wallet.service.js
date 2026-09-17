'use strict';

const Wallet = require('../models/Wallet');
const WalletTransaction = require('../models/WalletTransaction');
const io = require('../sockets/io');
const logger = require('../utils/logger');
const notifications = require('./notification.service');
const walletHoldService = require('./walletHold.service');
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

function availableBalanceOf(wallet) {
  return Math.max(0, Number(wallet?.balance || 0) - Number(wallet?.reservedBalance || 0));
}

/** جلب محفظة المستخدم أو إنشاؤها إن لم تكن موجودة. */
async function getOrCreateWallet(userId) {
  const wallet = await Wallet.findOneAndUpdate(
    { user: userId },
    { $setOnInsert: { user: userId, balance: 0, reservedBalance: 0, currency: 'ILS' } },
    { new: true, upsert: true }
  );
  return wallet;
}

/** ملخّص المحفظة للمستخدم (الإجمالي + المحجوز + المتاح + العملة). */
async function getWalletSummary(userId) {
  const wallet = await getOrCreateWallet(userId);
  return {
    balance: Number(wallet.balance || 0),
    reservedBalance: Number(wallet.reservedBalance || 0),
    availableBalance: availableBalanceOf(wallet),
    currency: wallet.currency,
  };
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
 * خصم رصيد ذرّيًّا بشرط كفاية الرصيد المتاح لا الإجمالي، حتى لا تُستهلك مبالغ
 * محجوزة لطلبات أخرى.
 * @returns {Promise<import('mongoose').Document>} المحفظة بعد الخصم
 */
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

/**
 * خصم قيمة طلب من محفظة المستخدم عند تأكيد التسليم.
 * إن وُجد حجز للطلب نلتقطه atomically: نخصم القيمة الحقيقية ونحرر كامل القيمة
 * التقديرية في نفس تحديث المحفظة. الفرق يعود متاحًا تلقائيًا.
 */
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

      // تعافٍ من انقطاع نادر بعد التقاط الحجز وقبل حفظ balanceAfter في الحركة.
      const hold = await walletHoldService.getOrderHold(orderId);
      if (
        existing &&
        hold?.status === 'released' &&
        Number(hold.capturedAmount) === value
      ) {
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
      // توافق مع الطلبات القديمة التي أُنشئت قبل ميزة الحجز.
      wallet = await debitWallet(userId, value);
    }
  } catch (err) {
    await WalletTransaction.deleteOne({ _id: transaction._id }).catch(() => {});
    throw err;
  }

  transaction.balanceAfter = wallet.balance;
  await transaction.save();

  // captureOrderHold يبث الحالة الكاملة بنفسه؛ الطلبات القديمة تحتاج البث التقليدي.
  if (!capturedHold) broadcastBalance(userId, wallet.balance);
  return wallet.balance;
}

/** استرداد دفعة طلب مرة واحدة فقط، مع رصيد قبل/بعد صالح للتدقيق. */
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

/**
 * Card 81: إضافة رصيد يدويًا من الأدمن (تعديل) — تُستخدم لتمويل الحسابات الخارجية
 * المؤقّتة كي يكفي رصيدها لدفع قيمة طلبها عند التسليم. تُسجّل حركة "تعديل" وتبثّ
 * الرصيد. التحقّق من كون الحساب خارجيًا يتمّ في طبقة المتحكّم.
 * @param {string} userId
 * @param {number} amount
 * @param {object} meta  بيانات تدقيق (سبب/المنفّذ)
 * @returns {Promise<number>} الرصيد بعد الإضافة
 */
async function adminCredit(userId, amount, meta = {}) {
  const value = Number(amount);
  if (!(value > 0)) throw httpError('قيمة الإضافة غير صالحة', 400);

  const wallet = await creditWallet(userId, value);
  try {
    await WalletTransaction.create({
      user: userId,
      wallet: wallet._id,
      type: WALLET_TX_TYPE.ADJUSTMENT,
      direction: WALLET_DIRECTION.CREDIT,
      amount: value,
      status: TOPUP_STATUS.APPROVED,
      balanceAfter: wallet.balance,
      gatewayResponse: meta,
    });
  } catch (err) {
    logger.warn('تعذّر تسجيل حركة إضافة الرصيد:', err.message);
  }

  broadcastBalance(userId, wallet.balance);
  return wallet.balance;
}

/**
 * Card 87: ضبط رصيد محفظة زبون على قيمة محدّدة من الأدمن (تعديل مباشر).
 */
async function adminSetBalance(userId, newBalance, meta = {}) {
  const target = Number(newBalance);
  if (!(target >= 0)) throw httpError('قيمة الرصيد غير صالحة', 400);

  const current = await getOrCreateWallet(userId);
  if (target < Number(current.reservedBalance || 0)) {
    throw httpError('لا يمكن خفض الرصيد عن المبلغ المحجوز للطلبات النشطة', 409);
  }
  const delta = target - current.balance;
  if (delta === 0) {
    broadcastBalance(userId, current.balance);
    return current.balance;
  }

  const wallet = await creditWallet(userId, delta); // delta قد يكون سالبًا
  try {
    await WalletTransaction.create({
      user: userId,
      wallet: wallet._id,
      type: WALLET_TX_TYPE.ADJUSTMENT,
      direction: delta > 0 ? WALLET_DIRECTION.CREDIT : WALLET_DIRECTION.DEBIT,
      amount: Math.abs(delta),
      status: TOPUP_STATUS.APPROVED,
      balanceAfter: wallet.balance,
      gatewayResponse: { ...meta, setTo: target },
    });
  } catch (err) {
    logger.warn('تعذّر تسجيل حركة تعديل الرصيد:', err.message);
  }

  broadcastBalance(userId, wallet.balance);
  return wallet.balance;
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

  // إشعار المستخدم (داخل التطبيق + Push ليصل حتى والتطبيق مغلق — Card 108)
  // + بثّ الرصيد الجديد لحظيًا ليتحدّث في المحفظة دون تحديث الصفحة.
  await notifications.notifyUser(claimed.user, ROLES.USER, {
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

  // Card 106: إشعار المستخدم بسبب الرفض (داخل التطبيق + Push). السبب يُخزَّن أيضًا
  // في rejectionReason فيظهر في سجلّ حركات المحفظة بالتطبيق.
  await notifications.notifyUser(rejected.user, ROLES.USER, {
    title: '⚠️ رُفض طلب الشحن',
    body: reason
      ? `سبب الرفض: ${reason}`
      : 'تعذّر تأكيد التحويل. تواصل مع الدعم إن كان لديك استفسار.',
    data: {
      type: 'WALLET_TOPUP_REJECTED',
      transactionId: String(rejected._id),
      reason: reason || '',
    },
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
  adminCredit,
  adminSetBalance,
  debitWallet,
  chargeForOrder,
  refundOrderPayment,
  broadcastBalance,
  createTopupTransaction,
  listUserTransactions,
  listTopups,
  approveTopup,
  rejectTopup,
  getUserWalletForAdmin,
};
