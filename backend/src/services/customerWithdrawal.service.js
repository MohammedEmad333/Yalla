'use strict';

const CustomerWithdrawal = require('../models/CustomerWithdrawal');
const Order = require('../models/Order');
const User = require('../models/User');
const Log = require('../models/Log');
const WalletTransaction = require('../models/WalletTransaction');
const io = require('../sockets/io');
const logger = require('../utils/logger');
const notifications = require('./notification.service');
const walletService = require('./wallet.service');
const { validateCustomerWithdrawal } = require('../utils/withdrawal');
const {
  ROLES,
  ROOMS,
  EVENTS,
  ORDER_STATUS,
  WITHDRAWAL_STATUS,
  WALLET_TX_TYPE,
  WALLET_DIRECTION,
  TOPUP_STATUS,
} = require('../utils/constants');

/**
 * خدمة سحب رصيد الزبائن (Card 98 + Card 99).
 * الرصيد المتاح للسحب = رصيد المحفظة الفعلي − مجموع طلبات السحب المعلّقة.
 * عند تنفيذ الأدمن ("تم التحويل") يُخصم المبلغ فعليًّا من محفظة الزبون.
 */

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

// Card 99: الحالات التي يُعدّ فيها للزبون طلب "جارٍ" يمنع السحب أثناءه.
const ACTIVE_ORDER_STATUSES = [
  ORDER_STATUS.PENDING,
  ORDER_STATUS.ASSIGNED,
  ORDER_STATUS.ACCEPTED,
  ORDER_STATUS.PICKED_UP,
];

/**
 * الرصيد المتاح للسحب: رصيد المحفظة ناقص مجموع طلبات السحب المعلّقة (المحجوزة).
 * @param {string} userId
 * @returns {Promise<{ balance:number, pending:number, available:number, currency:string }>}
 */
async function getAvailable(userId) {
  const [summary, pendingList] = await Promise.all([
    walletService.getWalletSummary(userId),
    CustomerWithdrawal.find({ user: userId, status: WITHDRAWAL_STATUS.PENDING })
      .select('amount')
      .lean(),
  ]);
  const pending = pendingList.reduce((sum, w) => sum + (Number(w.amount) || 0), 0);
  const available = Math.max(0, +(summary.balance - pending).toFixed(2));
  return { balance: summary.balance, pending, available, currency: summary.currency };
}

/** هل لدى الزبون طلب توصيل جارٍ الآن؟ (Card 99) */
async function hasActiveOrder(userId) {
  const count = await Order.countDocuments({
    user: userId,
    status: { $in: ACTIVE_ORDER_STATUSES },
  });
  return count > 0;
}

/** طلبات سحب الزبون (الأحدث أولًا). */
async function listMine(userId, { limit = 30 } = {}) {
  return CustomerWithdrawal.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

/**
 * Card 98 + Card 99: إنشاء طلب سحب رصيد لزبون.
 * يمنع السحب أثناء وجود طلب جارٍ (Card 99)، ويتحقّق من الحدّ الأدنى وكفاية الرصيد
 * المتاح، ثم يُنشئ طلبًا معلّقًا يظهر للأدمن. الخصم الفعلي يتمّ عند تنفيذ الأدمن.
 * @param {string} userId
 * @param {{amount:number, destination:string, accountNumber:string, accountOwner?:string, note?:string}} payload
 */
async function requestWithdrawal(userId, payload = {}) {
  // Card 99: امنع السحب أثناء وجود طلب جارٍ مع تحذير يوضّح السبب.
  if (await hasActiveOrder(userId)) {
    throw httpError(
      'لا يمكنك سحب رصيدك أثناء وجود طلب جارٍ. بإمكانك طلب السحب بعد اكتمال توصيل طلبك وخصم قيمته من رصيدك.',
      409
    );
  }

  const { available } = await getAvailable(userId);
  const amount = Number(payload.amount);
  const destination = String(payload.destination || '').trim();
  const accountNumber = String(payload.accountNumber || '').trim();

  const error = validateCustomerWithdrawal({ amount, destination, accountNumber }, available);
  if (error) throw httpError(error, 400);

  const withdrawal = await CustomerWithdrawal.create({
    user: userId,
    amount,
    destination,
    accountNumber,
    accountOwner: String(payload.accountOwner || '').trim(),
    note: String(payload.note || '').trim(),
    status: WITHDRAWAL_STATUS.PENDING,
  });

  await Log.create({
    actorId: userId,
    actorRole: 'user',
    action: 'CUSTOMER_WITHDRAWAL_REQUESTED',
    meta: { withdrawalId: withdrawal._id, amount, destination },
  }).catch(() => {});

  // إعلام الأدمن بطلب سحب جديد ليظهر في لوحته فورًا
  try {
    const user = await User.findById(userId).select('name lastName phone').lean();
    io.get().to(ROOMS.admins()).emit(EVENTS.WITHDRAWAL_REQUESTED, {
      kind: 'customer',
      id: withdrawal._id,
      user: user
        ? { id: String(userId), name: [user.name, user.lastName].filter(Boolean).join(' '), phone: user.phone }
        : { id: String(userId) },
      amount,
      destination,
      accountNumber,
      status: withdrawal.status,
      createdAt: withdrawal.createdAt,
    });
  } catch (_) {
    // السوكت غير مهيّأ (اختبارات) — نتجاهل بأمان
  }

  // Card 103: إشعار Push لأجهزة الأدمن بطلب سحب رصيد عميل جديد — غير حاجب
  notifications
    .notifyAdmins(notifications.withdrawalAdminPayload({ who: 'customer', amount }))
    .catch(() => {});

  return withdrawal;
}

/** قائمة طلبات سحب الزبائن للأدمن (فلترة اختيارية بالحالة). */
async function listAll({ status, limit = 50 } = {}) {
  const filter = {};
  if (status && status !== 'all') filter.status = status;
  return CustomerWithdrawal.find(filter)
    .populate('user', 'name lastName phone')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

/**
 * Card 98: تنفيذ الأدمن لطلب سحب زبون.
 *   "تم التحويل" (done): يُخصم المبلغ فعليًّا من محفظة الزبون ويُرسَل إشعار بأنّ
 *   رصيده حُوّل إلى محفظته/بنكه الخارجي.
 *   "رفض" (rejected): لا خصم، مع إشعار الزبون.
 * ذرّية: نُحدّث الحالة فقط إن كانت pending لمنع التنفيذ المزدوج، ثم نخصم.
 * @param {string} adminId
 * @param {string} withdrawalId
 * @param {'done'|'rejected'} action
 * @param {string} adminNote
 */
async function process(adminId, withdrawalId, action, adminNote = '') {
  const nextStatus =
    action === 'done'
      ? WITHDRAWAL_STATUS.DONE
      : action === 'rejected'
        ? WITHDRAWAL_STATUS.REJECTED
        : null;
  if (!nextStatus) throw httpError('إجراء غير صالح (done أو rejected)', 400);

  // نطالب الطلب ذرّيًّا (pending → next) لمنع التنفيذ المزدوج تحت التزامن
  const withdrawal = await CustomerWithdrawal.findOneAndUpdate(
    { _id: withdrawalId, status: WITHDRAWAL_STATUS.PENDING },
    { status: nextStatus, adminNote, processedAt: new Date() },
    { new: true }
  );
  if (!withdrawal) throw httpError('طلب السحب غير موجود أو عُولج مسبقًا', 404);

  let newBalance = null;
  if (nextStatus === WITHDRAWAL_STATUS.DONE) {
    // خصم فعلي من محفظة الزبون. إن لم يعد الرصيد كافيًا (تغيّر بعد الطلب) نُعيد
    // الطلب لحالته المعلّقة ونرفض التنفيذ بأمان بدل ترك حالة غير متّسقة.
    try {
      newBalance = await walletService.debitWallet(withdrawal.user, withdrawal.amount).then(
        (w) => w.balance
      );
    } catch (err) {
      await CustomerWithdrawal.updateOne(
        { _id: withdrawal._id },
        { status: WITHDRAWAL_STATUS.PENDING, processedAt: null }
      );
      throw httpError('رصيد الزبون لم يعد كافيًا لتنفيذ السحب', 400);
    }
    walletService.broadcastBalance(withdrawal.user, newBalance);

    // نسجّل حركة خصم في دفتر الأستاذ لتظهر في سجلّ حركات الزبون (لا توقف التدفّق)
    try {
      const wallet = await walletService.getOrCreateWallet(withdrawal.user);
      await WalletTransaction.create({
        user: withdrawal.user,
        wallet: wallet._id,
        type: WALLET_TX_TYPE.WITHDRAWAL,
        direction: WALLET_DIRECTION.DEBIT,
        amount: withdrawal.amount,
        status: TOPUP_STATUS.APPROVED,
        balanceAfter: newBalance,
        gatewayResponse: {
          withdrawalId: String(withdrawal._id),
          destination: withdrawal.destination,
          accountNumber: withdrawal.accountNumber,
        },
      });
    } catch (e) {
      logger.warn('تعذّر تسجيل حركة سحب رصيد الزبون:', e.message);
    }
  }

  await Log.create({
    actorId: adminId,
    actorRole: 'admin',
    action:
      nextStatus === WITHDRAWAL_STATUS.DONE
        ? 'CUSTOMER_WITHDRAWAL_DONE'
        : 'CUSTOMER_WITHDRAWAL_REJECTED',
    meta: { withdrawalId: withdrawal._id, amount: withdrawal.amount },
  }).catch(() => {});

  // Card 98: إشعار الزبون بنتيجة طلبه (داخل التطبيق + Push)
  const payload =
    nextStatus === WITHDRAWAL_STATUS.DONE
      ? {
          title: '💸 تم سحب رصيدك',
          body: `تم تحويل ${withdrawal.amount} ₪ من حسابك إلى ${withdrawal.destination} (${withdrawal.accountNumber}).`,
          data: { type: 'CUSTOMER_WITHDRAWAL_DONE', withdrawalId: String(withdrawal._id) },
        }
      : {
          title: 'طلب سحب الرصيد مرفوض',
          body: adminNote || 'تعذّر تنفيذ طلب سحب رصيدك — تواصل مع الدعم.',
          data: { type: 'CUSTOMER_WITHDRAWAL_REJECTED', withdrawalId: String(withdrawal._id) },
        };
  notifications.createInApp(withdrawal.user, ROLES.USER, payload).catch(() => {});
  User.findById(withdrawal.user)
    .select('deviceTokens')
    .then((u) => {
      if (u?.deviceTokens?.length) return notifications.sendToTokens(u.deviceTokens, payload);
    })
    .catch((e) => logger.warn('تعذّر إرسال إشعار سحب الزبون:', e.message));

  return { withdrawal, balance: newBalance };
}

module.exports = {
  getAvailable,
  hasActiveOrder,
  listMine,
  requestWithdrawal,
  listAll,
  process,
};
