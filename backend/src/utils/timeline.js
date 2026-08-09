'use strict';

const { ORDER_STATUS } = require('./constants');

// بناء خطوات الخطّ الزمني لطلب — دالة نقيّة قابلة للاختبار.

/**
 * يبني قائمة مراحل الطلب مع طوابعها الزمنية وحالة اكتمالها.
 * @param {Object} order  مستند الطلب (createdAt + timeline)
 * @returns {Array<{key:string, label:string, at:Date|null, done:boolean}>}
 */
function buildTimeline(order) {
  const t = order.timeline || {};

  const steps = [
    { key: 'created', label: 'تم إنشاء الطلب', at: order.createdAt },
    { key: 'assigned', label: 'تم تعيين كابتن', at: t.assignedAt },
    { key: 'accepted', label: 'الكابتن في الطريق للاستلام', at: t.acceptedAt },
    { key: 'picked_up', label: 'تم استلام الشحنة', at: t.pickedUpAt },
    { key: 'delivered', label: 'تم التسليم', at: t.deliveredAt },
  ].map((s) => ({ ...s, at: s.at || null, done: Boolean(s.at) }));

  // الإلغاء مسار منفصل — نضيفه كخطوة نهائية
  if (order.status === ORDER_STATUS.CANCELLED) {
    steps.push({ key: 'cancelled', label: 'أُلغي الطلب', at: t.cancelledAt || null, done: true });
  }

  return steps;
}

module.exports = { buildTimeline };
