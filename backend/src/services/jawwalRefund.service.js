'use strict';

const Order = require('../models/Order');
const OrderPayment = require('../models/OrderPayment');
const AuditLog = require('../models/AuditLog');
const notifications = require('./notification.service');

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function publicRefund(payment) {
  const order = payment.order || {};
  return {
    id: String(payment._id),
    orderId: String(order?._id || payment.order),
    user: payment.user,
    status: payment.status,
    amount: Number(payment.amount) || 0,
    currency: payment.currency || 'ILS',
    phone: payment.phone || '',
    reference: payment.providerReference || '',
    transactionId: payment.providerTransactionId || '',
    failureReason: payment.failureReason || '',
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
    order: order?._id ? {
      id: String(order._id),
      status: order.status,
      cancelReason: order.cancelReason || '',
      storeName: order.store?.name || '',
      createdAt: order.createdAt,
    } : undefined,
  };
}

async function markRefundPendingForOrder(orderId, reason = '') {
  const payment = await OrderPayment.findOne({ order: orderId });
  if (!payment || payment.provider !== 'jawwal_pay') return null;
  if (payment.status === 'refunded' || payment.status === 'refund_pending') return publicRefund(payment);
  if (payment.status !== 'paid') return null;

  payment.status = 'refund_pending';
  payment.failureReason = String(reason || 'طلب ملغى بعد اكتمال الدفع').trim();
  await payment.save();

  const order = await Order.findById(orderId);
  if (order) {
    if (order.payment) order.payment.status = 'refund_pending';
    order.refundAmount = Number(payment.amount) || 0;
    order.refundedAt = null;
    await order.save();
  }

  await notifications.notifyUser(payment.user, 'user', {
    title: '↩️ الاسترداد قيد المعالجة',
    body: `تم إلغاء الطلب وسيتم إعادة ${Number(payment.amount) || 0} ₪ عبر جوال بعد معالجة الاسترداد.`,
    data: { type: 'ORDER_REFUND_PENDING', orderId: String(orderId), amount: Number(payment.amount) || 0 },
  }).catch(() => {});

  return publicRefund(payment);
}

async function listRefunds(query = {}) {
  const status = String(query.status || 'refund_pending');
  const filter = { provider: 'jawwal_pay' };
  if (status !== 'all') {
    if (!['refund_pending', 'refunded'].includes(status)) throw httpError('حالة استرداد غير صالحة');
    filter.status = status;
  } else {
    filter.status = { $in: ['refund_pending', 'refunded'] };
  }

  const rows = await OrderPayment.find(filter)
    .populate('user', 'name lastName phone')
    .populate('order', 'status cancelReason store.name createdAt')
    .sort({ updatedAt: -1 })
    .limit(300)
    .lean();
  return rows.map(publicRefund);
}

async function markRefunded(adminId, paymentId, payload = {}) {
  const note = String(payload.note || '').trim();
  const reference = String(payload.refundReference || '').trim();
  const update = {
    $set: {
      status: 'refunded',
      failureReason: note,
      ...(reference ? { 'providerResponse.manual_refund_reference': reference } : {}),
    },
  };

  // Atomic state transition: only one concurrent request may turn refund_pending into refunded.
  // This prevents duplicate audit entries and duplicate user notifications from double taps/retries.
  let payment = await OrderPayment.findOneAndUpdate(
    { _id: paymentId, provider: 'jawwal_pay', status: 'refund_pending' },
    update,
    { new: true }
  );

  if (!payment) {
    const current = await OrderPayment.findById(paymentId);
    if (!current || current.provider !== 'jawwal_pay') throw httpError('عملية الدفع غير موجودة', 404);
    if (current.status === 'refunded') return publicRefund(current);
    throw httpError('هذه العملية ليست بانتظار الاسترداد', 409);
  }

  const order = await Order.findById(payment.order);
  if (order) {
    if (order.payment) order.payment.status = 'refunded';
    order.refundedAt = new Date();
    order.refundAmount = Number(payment.amount) || 0;
    order.financialSettlementState = 'refunded';
    order.customerCharged = 0;
    order.adminCredit = 0;
    order.merchantCredit = 0;
    await order.save();
  }

  await AuditLog.create({
    actor: adminId,
    action: 'jawwal_refund_completed',
    entityType: 'OrderPayment',
    entityId: String(payment._id),
    summary: `تأكيد استرداد ${payment.amount} ₪ لطلب ${String(payment.order)}`,
    metadata: { orderId: String(payment.order), amount: payment.amount, refundReference: reference, note },
  });

  await notifications.notifyUser(payment.user, 'user', {
    title: '✅ تم الاسترداد',
    body: `تمت معالجة استرداد ${Number(payment.amount) || 0} ₪ لطلبك.`,
    data: { type: 'ORDER_REFUNDED', orderId: String(payment.order), amount: Number(payment.amount) || 0 },
  }).catch(() => {});

  return publicRefund(payment);
}

module.exports = {
  markRefundPendingForOrder,
  listRefunds,
  markRefunded,
};
