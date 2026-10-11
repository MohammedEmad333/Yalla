'use strict';

const orderService = require('./order.service');
const logger = require('../utils/logger');
const { singleFlight } = require('../utils/singleFlight');

// مُشغّل خلفي بسيط: يفحص الطلبات المجدولة دوريًا ويُفعّل المستحقّ منها.
// (لخادم واحد؛ في نشر موزّع يُفضّل قفل/طابور مشترك لتفادي التكرار.)

/**
 * بدء المُشغّل.
 * @param {{ intervalMs?: number }} options
 * @returns {{ stop: Function }} مقبض لإيقاف المُشغّل
 */
function startScheduler({ intervalMs = 60_000 } = {}) {
  // Each stage is independent: an intermittent DB error while activating scheduled
  // orders must not suppress reassignment and delayed-order alerts for this tick.
  async function runStage(label, operation) {
    try {
      const count = await operation();
      if (count > 0) logger.info(`⏰ ${label}: ${count}`);
    } catch (err) {
      logger.error(`خطأ في ${label}:`, err.message);
    }
  }

  async function tick() {
    await runStage('تفعيل الطلبات المجدولة', () => orderService.activateDueScheduledOrders());
    await runStage('إعادة إسناد الطلبات المنتهية', () => orderService.expireStaleAssignments());
    await runStage('تنبيهات الطلبات المتأخرة', () => orderService.warnDelayedOrders());
  }

  const handle = setInterval(singleFlight(tick), intervalMs);
  if (handle.unref) handle.unref(); // لا يمنع إغلاق العملية
  logger.info(`⏰ مُشغّل الطلبات المجدولة يعمل كل ${intervalMs / 1000} ثانية`);

  return { stop: () => clearInterval(handle) };
}

module.exports = { startScheduler };
