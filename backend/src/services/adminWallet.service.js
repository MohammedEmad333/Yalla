'use strict';

const Order = require('../models/Order');
const WalletTransaction = require('../models/WalletTransaction');
const { ORDER_STATUS } = require('../utils/constants');

/**
 * محفظة الإدارة مشتقة من الطلبات المسلّمة، لذلك لا يمكن أن يضيع رصيدها أو
 * يتضاعف بسبب إعادة نداء التسليم. دخل طلب المطعم = قيمة الأصناف + العمولة،
 * ودخل الطلب العادي = العمولة فقط.
 */
async function getWallet({ limit = 50, skip = 0, q = '', type = 'all', from, to } = {}) {
  // adminCredit يُملأ فقط عند تنفيذ التسوية الجديدة؛ لا نحتسب طلبات تاريخية
  // كانت مدفوعة بالنظام القديم كأنها أموال دخلت المحفظة الآن.
  const filter = { status: ORDER_STATUS.DELIVERED, adminCredit: { $gt: 0 } };
  if (type === 'restaurant') filter['store.itemsTotal'] = { $gt: 0 };
  if (type === 'delivery') filter['store.itemsTotal'] = { $not: { $gt: 0 } };
  if (from || to) {
    filter.financialSettledAt = {};
    if (from) filter.financialSettledAt.$gte = new Date(from);
    if (to) filter.financialSettledAt.$lte = new Date(to);
  }
  const [orders, totals] = await Promise.all([
    Order.find(filter)
      .select('store.name store.itemsTotal commission captainNet adminCredit financialSettledAt finalPrice price timeline.deliveredAt createdAt')
      .populate('user', 'name lastName phone')
      .populate('captain', 'name phone')
      .sort({ 'timeline.deliveredAt': -1, createdAt: -1 })
      .skip(skip)
      .limit(Math.min(100, Math.max(1, Number(limit) || 50)))
      .lean(),
    Order.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          itemsRevenue: {
            $sum: {
              $cond: [
                { $gt: ['$adminCredit', 0] },
                { $ifNull: ['$store.itemsTotal', 0] },
                0,
              ],
            },
          },
          commissionRevenue: {
            $sum: { $cond: [{ $gt: ['$adminCredit', 0] }, '$commission', 0] },
          },
          captainPayouts: { $sum: { $ifNull: ['$captainNet', 0] } },
          transactionsCount: { $sum: 1 },
        },
      },
    ]),
  ]);

  const summary = totals[0] || {
    itemsRevenue: 0,
    commissionRevenue: 0,
    captainPayouts: 0,
    transactionsCount: 0,
  };
  const payments = await WalletTransaction.find({
    $or: [
      { order: { $in: orders.map((o) => o._id) } },
      { idempotencyKey: { $in: orders.map((o) => `order-payment:${o._id}`) } },
    ],
  }).select('order idempotencyKey balanceBefore balanceAfter').lean();
  const paymentByOrder = new Map(payments.map((p) => [
    String(p.order || String(p.idempotencyKey || '').replace('order-payment:', '')), p,
  ]));

  let transactions = orders.map((order) => {
    const settled = Number(order.adminCredit) > 0;
    const itemsAmount = settled ? Number(order.store?.itemsTotal) || 0 : 0;
    const commissionAmount = settled ? Number(order.commission) || 0 : 0;
    const payment = paymentByOrder.get(String(order._id));
    return {
      orderId: order._id,
      restaurantName: order.store?.name || '',
      customer: order.user,
      captain: order.captain,
      itemsAmount,
      commissionAmount,
      amount: Number(order.adminCredit) || 0,
      type: itemsAmount > 0 ? 'restaurant_settlement' : 'delivery_commission',
      customerBalanceBefore: payment?.balanceBefore ?? null,
      customerBalanceAfter: payment?.balanceAfter ?? null,
      deliveredAt: order.financialSettledAt || order.timeline?.deliveredAt || order.createdAt,
    };
  });
  // رصيد محفظة الإدارة قبل/بعد كل حركة (القائمة مرتبة من الأحدث للأقدم).
  let runningAdminBalance = summary.itemsRevenue + summary.commissionRevenue;
  for (const tx of transactions) {
    tx.balanceAfter = runningAdminBalance;
    tx.balanceBefore = Math.round((runningAdminBalance - tx.amount) * 100) / 100;
    runningAdminBalance = tx.balanceBefore;
  }
  const search = String(q || '').trim().toLowerCase();
  if (search) {
    transactions = transactions.filter((tx) =>
      [tx.orderId, tx.restaurantName, tx.customer?.name, tx.customer?.lastName, tx.customer?.phone, tx.captain?.name, tx.captain?.phone]
        .some((v) => String(v || '').toLowerCase().includes(search))
    );
  }

  return {
    balance: summary.itemsRevenue + summary.commissionRevenue,
    currency: 'ILS',
    ...summary,
    transactions,
  };
}

module.exports = { getWallet };
