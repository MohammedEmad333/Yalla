'use strict';

const Order = require('../models/Order');
const OrderPayment = require('../models/OrderPayment');
const jawwal = require('./jawwalPayClient');
const orderService = require('./order.service');
const inventoryService = require('./inventory.service');
const rewardsService = require('./rewards.service');
const { ORDER_STATUS } = require('../utils/constants');
const { normalizePalestinianMobile } = require('../utils/phone');

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

function amountFor(order) {
  const items = Number(order.store?.itemsTotal) || 0;
  const delivery = Number(order.price) || 0;
  const reward = Number(order.rewardDiscount) || 0;
  return Math.max(0, Math.round((items + delivery - reward) * 100) / 100);
}

function publicPayment(payment) {
  return {
    orderId: String(payment.order),
    provider: payment.provider,
    status: payment.status,
    amount: payment.amount,
    currency: payment.currency,
    reference: payment.providerReference,
    phone: payment.phone,
  };
}

async function startOrderPayment(userId, orderId, walletPhone) {
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw httpError('الطلب غير موجود', 404);
  if (order.status !== ORDER_STATUS.AWAITING_PAYMENT) {
    const existing = await OrderPayment.findOne({ order: order._id });
    if (existing?.status === 'paid') return publicPayment(existing);
    throw httpError('هذا الطلب ليس بانتظار الدفع', 409);
  }

  const paymentPhone = normalizePalestinianMobile(walletPhone);
  if (!paymentPhone) {
    throw httpError('أدخل رقم جوال المحفظة بصيغة 05xxxxxxxx');
  }

  let existing = await OrderPayment.findOne({ order: order._id });
  if (existing && ['otp_sent', 'created', 'paid'].includes(existing.status)) {
    if (existing.status === 'paid' || existing.phone === paymentPhone) {
      return publicPayment(existing);
    }
    throw httpError('تم إرسال رمز تحقق مسبقًا لرقم محفظة آخر. ألغِ العملية وابدأ من جديد.', 409);
  }

  const amount = amountFor(order);
  if (!(amount > 0)) throw httpError('قيمة الطلب غير صالحة للدفع');

  const idempotencyKey = `jawwal-order:${order._id}`;
  const created = await jawwal.createPayment({
    mobile: paymentPhone,
    amount,
    externalReference: String(order._id),
    idempotencyKey,
    description: `Yalla order ${String(order._id)}`,
  });

  existing = await OrderPayment.findOneAndUpdate(
    { order: order._id },
    {
      $setOnInsert: {
        order: order._id,
        user: userId,
        provider: 'jawwal_pay',
        amount,
        currency: 'ILS',
        idempotencyKey,
      },
      $set: {
        phone: paymentPhone,
        status: 'otp_sent',
        providerReference: created.reference,
        providerTransactionId: created.transactionId,
        providerResponse: created.data,
        failureReason: '',
        cancelledAt: null,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  order.payment = {
    method: 'jawwal_pay',
    status: 'otp_sent',
    reference: created.reference,
    transactionId: created.transactionId,
    amount,
    currency: 'ILS',
    paidAt: null,
  };
  await order.save();

  return publicPayment(existing);
}

async function confirmOrderPayment(userId, orderId, otp) {
  const code = String(otp || '').trim();
  if (!/^\d{4,8}$/.test(code)) throw httpError('أدخل رمز التحقق الصحيح');

  const payment = await OrderPayment.findOne({ order: orderId, user: userId });
  if (!payment) throw httpError('عملية الدفع غير موجودة', 404);
  if (payment.status === 'paid') {
    const order = await orderService.activatePaidOrder(orderId, {
      reference: payment.providerReference,
      transactionId: payment.providerTransactionId,
      amount: payment.amount,
      paidAt: payment.paidAt || new Date(),
    });
    return { payment: publicPayment(payment), order };
  }
  if (!payment.providerReference) throw httpError('مرجع الدفع غير موجود', 409);

  const result = await jawwal.confirmPayment(payment.providerReference, code);
  if (!jawwal.isPaid(result)) {
    payment.providerResponse = result;
    payment.failureReason = String(result.message || result.error || 'لم يتم تأكيد الدفع');
    await payment.save();
    throw httpError('لم يتم تأكيد الدفع من جوال', 400);
  }

  payment.status = 'paid';
  payment.providerResponse = result;
  payment.providerTransactionId = jawwal.transactionIdOf(result) || payment.providerTransactionId;
  payment.paidAt = new Date();
  payment.failureReason = '';
  await payment.save();

  const order = await orderService.activatePaidOrder(orderId, {
    reference: payment.providerReference,
    transactionId: payment.providerTransactionId,
    amount: payment.amount,
    paidAt: payment.paidAt,
  });

  return { payment: publicPayment(payment), order };
}

async function cancelOrderPayment(userId, orderId) {
  const payment = await OrderPayment.findOne({ order: orderId, user: userId });
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw httpError('الطلب غير موجود', 404);
  if (payment?.status === 'paid') throw httpError('لا يمكن إلغاء دفعة مكتملة من هذا المسار', 409);

  if (payment?.providerReference) {
    await jawwal.cancelPayment(payment.providerReference).catch(() => null);
  }
  if (payment) {
    payment.status = 'cancelled';
    payment.cancelledAt = new Date();
    await payment.save();
  }

  if (order.status === ORDER_STATUS.AWAITING_PAYMENT) {
    order.status = ORDER_STATUS.CANCELLED;
    order.cancelReason = 'ألغى المستخدم عملية الدفع';
    order.timeline.cancelledAt = new Date();
    if (order.payment) order.payment.status = 'cancelled';
    await order.save();
    await Promise.all([
      inventoryService.releaseOrderInventory(order._id).catch(() => {}),
      rewardsService.releaseReservation(userId, Number(order.rewardPointsUsed) || 0).catch(() => {}),
    ]);
  }

  return { ok: true, orderId: String(order._id), status: 'cancelled' };
}

async function getOrderPayment(userId, orderId) {
  const payment = await OrderPayment.findOne({ order: orderId, user: userId });
  if (!payment) throw httpError('عملية الدفع غير موجودة', 404);

  if (payment.status === 'paid') {
    await orderService.activatePaidOrder(orderId, {
      reference: payment.providerReference,
      transactionId: payment.providerTransactionId,
      amount: payment.amount,
      paidAt: payment.paidAt || new Date(),
    });
    return publicPayment(payment);
  }

  if (payment.providerReference && !['cancelled', 'refunded'].includes(payment.status)) {
    const remote = await jawwal.getPayment(payment.providerReference).catch(() => null);
    if (remote && jawwal.isPaid(remote)) {
      payment.status = 'paid';
      payment.providerResponse = remote;
      payment.providerTransactionId = jawwal.transactionIdOf(remote) || payment.providerTransactionId;
      payment.paidAt = payment.paidAt || new Date();
      await payment.save();
      await orderService.activatePaidOrder(orderId, {
        reference: payment.providerReference,
        transactionId: payment.providerTransactionId,
        amount: payment.amount,
        paidAt: payment.paidAt,
      });
    }
  }
  return publicPayment(payment);
}

module.exports = {
  startOrderPayment,
  confirmOrderPayment,
  cancelOrderPayment,
  getOrderPayment,
  amountFor,
};
