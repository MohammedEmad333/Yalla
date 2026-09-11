'use strict';

const Order = require('../models/Order');
const { ORDER_STATUS } = require('../utils/constants');

/**
 * محفظة الإدارة مشتقة من الطلبات المسلّمة، لذلك لا يمكن أن يضيع رصيدها أو
 * يتضاعف بسبب إعادة نداء التسليم. دخل طلب المطعم = قيمة الأصناف + العمولة،
 * ودخل الطلب العادي = العمولة فقط.
 */
async function getWallet({ limit = 50, skip = 0 } = {}) {
  // adminCredit يُملأ فقط عند تنفيذ التسوية الجديدة؛ لا نحتسب طلبات تاريخية
  // كانت مدفوعة بالنظام القديم كأنها أموال دخلت المحفظة الآن.
  const filter = { status: ORDER_STATUS.DELIVERED, adminCredit: { $gt: 0 } };
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
  const transactions = orders.map((order) => {
    const settled = Number(order.adminCredit) > 0;
    const itemsAmount = settled ? Number(order.store?.itemsTotal) || 0 : 0;
    const commissionAmount = settled ? Number(order.commission) || 0 : 0;
    return {
      orderId: order._id,
      restaurantName: order.store?.name || '',
      customer: order.user,
      captain: order.captain,
      itemsAmount,
      commissionAmount,
      amount: Number(order.adminCredit) || 0,
      deliveredAt: order.financialSettledAt || order.timeline?.deliveredAt || order.createdAt,
    };
  });

  return {
    balance: summary.itemsRevenue + summary.commissionRevenue,
    currency: 'ILS',
    ...summary,
    transactions,
  };
}

module.exports = { getWallet };
