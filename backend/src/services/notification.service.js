'use strict';

const fs = require('fs');
const env = require('../config/env');
const logger = require('../utils/logger');

/**
 * خدمة الإشعارات (FCM) عبر Firebase Admin.
 *
 * تصميم آمن: إن لم تُضبط بيانات اعتماد Firebase تعمل الخدمة كـ no-op
 * (تسجّل تحذيرًا فقط) حتى يظلّ النظام قابلًا للتشغيل بدون Firebase أثناء التطوير.
 *
 * بُناة الحمولة (payload) دوال نقيّة قابلة للاختبار بلا اتصال بالشبكة.
 */

let messaging = null;      // مرجع firebase-admin messaging بعد التهيئة
let initialized = false;   // هل جرت محاولة التهيئة؟

// تهيئة كسولة لـ firebase-admin مرّة واحدة عند أوّل استخدام
function ensureInit() {
  if (initialized) return;
  initialized = true;

  // لا توجد بيانات اعتماد → نبقى في وضع no-op
  if (!env.fcm.credentialsPath || !fs.existsSync(env.fcm.credentialsPath)) {
    logger.warn('FCM غير مُهيّأ (لا يوجد ملف اعتماد) — الإشعارات معطّلة');
    return;
  }

  try {
    // نحمّل الحزمة كسوليًا حتى لا تكون مطلوبة في بيئة بلا Firebase
    // eslint-disable-next-line global-require
    const admin = require('firebase-admin');
    const serviceAccount = JSON.parse(fs.readFileSync(env.fcm.credentialsPath, 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    messaging = admin.messaging();
    logger.info('✅ FCM مُهيّأ — الإشعارات مفعّلة');
  } catch (err) {
    logger.error('فشل تهيئة FCM — الإشعارات معطّلة:', err.message);
  }
}

function isEnabled() {
  ensureInit();
  return !!messaging;
}

/**
 * إرسال إشعار لمجموعة رموز أجهزة. آمن: لا يفعل شيئًا إن كانت الخدمة معطّلة
 * أو لا توجد رموز.
 * @param {string[]} tokens
 * @param {{title:string, body:string, data?:object}} payload
 */
async function sendToTokens(tokens, { title, body, data = {} }) {
  if (!Array.isArray(tokens) || tokens.length === 0) return { sent: 0 };
  if (!isEnabled()) return { sent: 0, skipped: true };

  try {
    // FCM يتطلّب قيم data نصّية
    const stringData = Object.fromEntries(
      Object.entries(data).map(([k, v]) => [k, String(v)])
    );
    const res = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: stringData,
    });
    return { sent: res.successCount, failed: res.failureCount };
  } catch (err) {
    logger.error('فشل إرسال إشعار FCM:', err.message);
    return { sent: 0, error: err.message };
  }
}

// ── بُناة الحمولة (دوال نقيّة) ────────────────────────────────

// إشعار الكابتن بطلب جديد مُسنَد إليه
function orderAssignedPayload(order) {
  return {
    title: '🛵 طلب جديد',
    body: `استلام من: ${order.pickup?.address || 'موقع الاستلام'}`,
    data: { type: 'ORDER_ASSIGNED', orderId: String(order._id) },
  };
}

// إشعار المستخدم بتغيّر حالة طلبه
function orderStatusPayload(order) {
  const labels = {
    accepted: 'الكابتن في الطريق إليك',
    picked_up: 'طلبك في الطريق للتسليم',
    delivered: 'تم تسليم طلبك ✓',
  };
  return {
    title: 'تحديث طلبك',
    body: labels[order.status] || `حالة الطلب: ${order.status}`,
    data: { type: 'ORDER_STATUS', orderId: String(order._id), status: order.status },
  };
}

// إشعار الكابتن بأن الطلب أُلغي
function orderCancelledPayload(order) {
  return {
    title: 'تم إلغاء الطلب',
    body: order.cancelReason || 'أُلغي الطلب',
    data: { type: 'ORDER_CANCELLED', orderId: String(order._id) },
  };
}

module.exports = {
  isEnabled,
  sendToTokens,
  orderAssignedPayload,
  orderStatusPayload,
  orderCancelledPayload,
};
