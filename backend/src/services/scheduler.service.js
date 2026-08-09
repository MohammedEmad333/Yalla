'use strict';

const orderService = require('./order.service');
const logger = require('../utils/logger');

// مُشغّل خلفي بسيط: يفحص الطلبات المجدولة دوريًا ويُفعّل المستحقّ منها.
// (لخادم واحد؛ في نشر موزّع يُفضّل قفل/طابور مشترك لتفادي التكرار.)

/**
 * بدء المُشغّل.
 * @param {{ intervalMs?: number }} options
 * @returns {{ stop: Function }} مقبض لإيقاف المُشغّل
 */
function startScheduler({ intervalMs = 60_000 } = {}) {
  async function tick() {
    try {
      const count = await orderService.activateDueScheduledOrders();
      if (count > 0) logger.info(`⏰ فُعّل ${count} طلب مجدول مستحقّ`);
    } catch (err) {
      logger.error('خطأ في مُشغّل الطلبات المجدولة:', err.message);
    }
  }

  const handle = setInterval(tick, intervalMs);
  if (handle.unref) handle.unref(); // لا يمنع إغلاق العملية
  logger.info(`⏰ مُشغّل الطلبات المجدولة يعمل كل ${intervalMs / 1000} ثانية`);

  return { stop: () => clearInterval(handle) };
}

module.exports = { startScheduler };
