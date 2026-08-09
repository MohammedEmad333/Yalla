'use strict';

const Order = require('../models/Order');
const Captain = require('../models/Captain');
const { ORDER_STATUS, CAPTAIN_STATUS } = require('../utils/constants');
const { averageDeliveryMinutes } = require('../utils/stats');

/**
 * خدمة الإحصائيات للوحة الأدمن — تجمّع مؤشّرات الأداء من الطلبات والكباتن.
 */
async function getDashboardStats() {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // نُشغّل الاستعلامات المستقلّة بالتوازي لتحسين الأداء
  const [byStatus, revenueAgg, deliveredOrders, todayCount, onlineCaptains] = await Promise.all([
    // عدد الطلبات حسب الحالة
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),

    // إجمالي الإيرادات من الطلبات المسلّمة
    Order.aggregate([
      { $match: { status: ORDER_STATUS.DELIVERED } },
      { $group: { _id: null, total: { $sum: '$price' } } },
    ]),

    // الطلبات المسلّمة (لحساب متوسّط زمن التوصيل)
    Order.find({ status: ORDER_STATUS.DELIVERED })
      .select('createdAt timeline.deliveredAt')
      .lean(),

    // طلبات اليوم
    Order.countDocuments({ createdAt: { $gte: startOfToday } }),

    // الكباتن المتصلون حاليًا
    Captain.countDocuments({ status: { $in: [CAPTAIN_STATUS.ONLINE, CAPTAIN_STATUS.BUSY] } }),
  ]);

  // تحويل نتيجة التجميع إلى كائن {status: count}
  const statusCounts = byStatus.reduce((acc, s) => ({ ...acc, [s._id]: s.count }), {});
  const totalOrders = Object.values(statusCounts).reduce((a, b) => a + b, 0);

  // متوسّط زمن التوصيل عبر الدالة النقيّة
  const avgMinutes = averageDeliveryMinutes(
    deliveredOrders.map((o) => ({ createdAt: o.createdAt, deliveredAt: o.timeline?.deliveredAt }))
  );

  return {
    totalOrders,
    todayOrders: todayCount,
    delivered: statusCounts[ORDER_STATUS.DELIVERED] || 0,
    cancelled: statusCounts[ORDER_STATUS.CANCELLED] || 0,
    active:
      (statusCounts[ORDER_STATUS.PENDING] || 0) +
      (statusCounts[ORDER_STATUS.ASSIGNED] || 0) +
      (statusCounts[ORDER_STATUS.ACCEPTED] || 0) +
      (statusCounts[ORDER_STATUS.PICKED_UP] || 0),
    revenue: revenueAgg[0]?.total || 0,
    avgDeliveryMinutes: avgMinutes,
    onlineCaptains,
    byStatus: statusCounts,
  };
}

module.exports = { getDashboardStats };
