'use strict';

const Order = require('../models/Order');
const Captain = require('../models/Captain');
const CaptainWithdrawal = require('../models/CaptainWithdrawal');
const Log = require('../models/Log');
const io = require('../sockets/io');
const logger = require('../utils/logger');
const notifications = require('./notification.service');
const {
  computeCaptainBalance,
  validateWithdrawal,
} = require('../utils/withdrawal');
const {
  ORDER_STATUS,
  WITHDRAWAL_STATUS,
  ROOMS,
  EVENTS,
} = require('../utils/constants');

/**
 * محفظة أرباح الكابتن وطلبات السحب (Card 19).
 * الرصيد القابل للسحب = صافي أرباح الطلبات المسلّمة − (المسحوب فعلًا + المعلّق).
 */

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

// إجمالي صافي أرباح الكابتن من الطلبات المسلّمة
async function sumEarnedNet(captainId) {
  const delivered = await Order.find({
    captain: captainId,
    status: ORDER_STATUS.DELIVERED,
  })
    .select('captainNet')
    .lean();
  return delivered.reduce((sum, o) => sum + (Number(o.captainNet) || 0), 0);
}

/** ملخّص محفظة الكابتن: الأرباح، المسحوب، المعلّق، والمتاح. */
async function getBalance(captainId) {
  const [earnedNet, withdrawals] = await Promise.all([
    sumEarnedNet(captainId),
    CaptainWithdrawal.find({ captain: captainId }).select('amount status').lean(),
  ]);
  const balance = computeCaptainBalance(earnedNet, withdrawals);
  return { ...balance, currency: 'ILS' };
}

/** طلبات سحب الكابتن (الأحدث أولًا). */
async function listWithdrawals(captainId, { limit = 30 } = {}) {
  return CaptainWithdrawal.find({ captain: captainId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

/**
 * إنشاء طلب سحب من الكابتن. يتحقّق من الحدّ الأدنى وكفاية الرصيد المتاح،
 * ثم يُنشئ طلبًا معلّقًا يظهر للأدمن. الخصم الفعلي يتمّ عند تنفيذ الأدمن.
 * @param {string} captainId
 * @param {{amount:number, method:string, phone:string}} payload
 */
async function requestWithdrawal(captainId, payload = {}) {
  const captain = await Captain.findById(captainId).select('name payoutWallets');
  if (!captain) throw httpError('الكابتن غير موجود', 404);

  // Card 71: طريقة السحب تُختار من محافظ الكابتن الإلكترونية المحفوظة فقط.
  // نستخرج رقم المحفظة واسم صاحبها من الخادم (مصدر الحقيقة) بدل الثقة بقيم الواجهة،
  // مع إبقاء التوافق مع الطلبات القديمة التي ترسل method/phone مباشرةً.
  let { method, phone } = payload;
  let walletCategory = '';
  let walletOwner = '';
  const category = String(payload.walletCategory || '').trim();
  if (category) {
    const wallet = (captain.payoutWallets || []).find((w) => w.category === category);
    if (!wallet || !wallet.number) {
      throw httpError('أضِف محفظتك الإلكترونية أولًا ثم اختر طريقة السحب', 400);
    }
    method = category;
    phone = String(wallet.number).trim();
    walletCategory = category;
    walletOwner = String(wallet.ownerName || '').trim();
  }

  const { available } = await getBalance(captainId);
  const amount = Number(payload.amount);
  const error = validateWithdrawal({ amount, method, phone }, available);
  if (error) throw httpError(error, 400);

  const withdrawal = await CaptainWithdrawal.create({
    captain: captainId,
    amount,
    method,
    phone: String(phone).trim(),
    walletCategory,
    walletOwner,
    status: WITHDRAWAL_STATUS.PENDING,
  });

  await Log.create({
    actorId: captainId,
    actorRole: 'captain',
    action: 'WITHDRAWAL_REQUESTED',
    meta: { withdrawalId: withdrawal._id, amount, method: payload.method },
  });

  // إعلام الأدمن بطلب سحب جديد ليظهر في لوحته فورًا
  try {
    io.get().to(ROOMS.admins()).emit(EVENTS.WITHDRAWAL_REQUESTED, {
      id: withdrawal._id,
      captain: { id: captain._id, name: captain.name },
      amount,
      method: withdrawal.method,
      phone: withdrawal.phone,
      walletCategory: withdrawal.walletCategory,
      walletOwner: withdrawal.walletOwner,
      status: withdrawal.status,
      createdAt: withdrawal.createdAt,
    });
  } catch (_) {
    // السوكت غير مهيّأ (اختبارات) — نتجاهل بأمان
  }

  // Card 103: إشعار Push لأجهزة الأدمن بطلب سحب رصيد كابتن جديد — غير حاجب
  notifications
    .notifyAdmins(notifications.withdrawalAdminPayload({ who: 'captain', name: captain.name, amount }))
    .catch(() => {});

  return withdrawal;
}

/** قائمة طلبات السحب للأدمن (فلترة اختيارية بالحالة). */
async function listAllWithdrawals({ status, limit = 50 } = {}) {
  const filter = {};
  if (status) filter.status = status;
  // Card 67: نُحضِر محافظ الكابتن المحفوظة ليعرف الأدمن وجهة التحويل الصحيحة.
  return CaptainWithdrawal.find(filter)
    .populate('captain', 'name phone payoutWallets')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

/**
 * تنفيذ الأدمن لطلب سحب: "تم التحويل" (done) يخصم من رصيد الكابتن منطقيًّا
 * (الرصيد محسوب اشتقاقًا فيصبح المبلغ ضمن "المسحوب")، أو "رفض" (rejected).
 * ذرّية: نُحدّث فقط إن كان الطلب ما زال pending لمنع التنفيذ المزدوج.
 * @param {string} withdrawalId
 * @param {'done'|'rejected'} action
 * @param {string} adminNote
 */
async function processWithdrawal(withdrawalId, action, adminNote = '') {
  const nextStatus =
    action === 'done'
      ? WITHDRAWAL_STATUS.DONE
      : action === 'rejected'
        ? WITHDRAWAL_STATUS.REJECTED
        : null;
  if (!nextStatus) throw httpError('إجراء غير صالح (done أو rejected)', 400);

  // تحديث مشروط بالحالة pending — يمنع الخصم المزدوج عند الضغط المتكرّر
  const withdrawal = await CaptainWithdrawal.findOneAndUpdate(
    { _id: withdrawalId, status: WITHDRAWAL_STATUS.PENDING },
    { status: nextStatus, adminNote, processedAt: new Date() },
    { new: true }
  );
  if (!withdrawal) throw httpError('طلب السحب غير موجود أو عُولج مسبقًا', 404);

  await Log.create({
    actorRole: 'admin',
    action: nextStatus === WITHDRAWAL_STATUS.DONE ? 'WITHDRAWAL_DONE' : 'WITHDRAWAL_REJECTED',
    meta: { withdrawalId: withdrawal._id, amount: withdrawal.amount },
  });

  // إشعار الكابتن بنتيجة طلبه (داخل التطبيق + Push) + بثّ تحديث رصيده لحظيًا
  const payload =
    nextStatus === WITHDRAWAL_STATUS.DONE
      ? {
          title: '💸 تم تحويل أموالك',
          body: `تم تحويل ${withdrawal.amount} ₪ إلى ${withdrawal.phone}`,
          data: { type: 'WITHDRAWAL_DONE', withdrawalId: String(withdrawal._id) },
        }
      : {
          title: 'طلب السحب مرفوض',
          body: adminNote || 'رُفض طلب سحب أموالك — تواصل مع الدعم',
          data: { type: 'WITHDRAWAL_REJECTED', withdrawalId: String(withdrawal._id) },
        };
  notifications.createInApp(withdrawal.captain, 'captain', payload);
  Captain.findById(withdrawal.captain)
    .select('deviceTokens')
    .then((c) => {
      if (c?.deviceTokens?.length) return notifications.sendToTokens(c.deviceTokens, payload);
    })
    .catch((e) => logger.warn('تعذّر إشعار الكابتن بنتيجة السحب:', e.message));

  try {
    const balance = await getBalance(withdrawal.captain);
    io.get().to(ROOMS.captain(String(withdrawal.captain))).emit(EVENTS.CAPTAIN_WALLET_UPDATED, balance);
  } catch (_) {
    // السوكت غير مهيّأ — نتجاهل
  }

  return withdrawal;
}

module.exports = {
  getBalance,
  listWithdrawals,
  requestWithdrawal,
  listAllWithdrawals,
  processWithdrawal,
};
