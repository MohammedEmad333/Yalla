'use strict';

const fs = require('fs');
const env = require('../config/env');
const logger = require('../utils/logger');
const Notification = require('../models/Notification');
const User = require('../models/User');
const Captain = require('../models/Captain');
const io = require('../sockets/io');
const { unreadCount } = require('../utils/notifications');
const { includesUsers, includesCaptains } = require('../utils/broadcast');
const { ROLES, ROOMS, EVENTS, BROADCAST_AUDIENCE } = require('../utils/constants');

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

/**
 * قراءة مفتاح خدمة Firebase من أحد مصدرين (بحسب بيئة التشغيل):
 *  1) FCM_CREDENTIALS_JSON — محتوى الـJSON كاملًا (الأنسب للاستضافة مثل Render).
 *  2) FCM_CREDENTIALS_PATH — مسار ملفّ محلّي (الأنسب للتطوير المحلّي).
 * @returns {object|null} كائن مفتاح الخدمة أو null إن لم يتوفّر.
 */
function loadServiceAccount() {
  // (1) محتوى JSON مباشر من متغيّر البيئة
  if (env.fcm.credentialsJson && env.fcm.credentialsJson.trim()) {
    return JSON.parse(env.fcm.credentialsJson);
  }
  // (2) ملفّ على القرص
  if (env.fcm.credentialsPath && fs.existsSync(env.fcm.credentialsPath)) {
    return JSON.parse(fs.readFileSync(env.fcm.credentialsPath, 'utf8'));
  }
  return null;
}

// تهيئة كسولة لـ firebase-admin مرّة واحدة عند أوّل استخدام
function ensureInit() {
  if (initialized) return;
  initialized = true;

  let serviceAccount;
  try {
    serviceAccount = loadServiceAccount();
  } catch (err) {
    logger.error('تعذّرت قراءة مفتاح خدمة Firebase (JSON غير صالح) — الإشعارات معطّلة:', err.message);
    return;
  }

  // لا توجد بيانات اعتماد → نبقى في وضع no-op
  if (!serviceAccount) {
    logger.warn('FCM غير مُهيّأ (لا يوجد مفتاح اعتماد) — الإشعارات معطّلة');
    return;
  }

  try {
    // نحمّل الحزمة كسوليًا حتى لا تكون مطلوبة في بيئة بلا Firebase
    // eslint-disable-next-line global-require
    const admin = require('firebase-admin');
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
    // إعدادات لضمان وصول الإشعار حتى والتطبيق مغلق/في الخلفية (Card 22):
    //  • Android: أولويّة عالية + قناة إشعارات + صوت افتراضي ليظهر في شريط النظام.
    //  • iOS (APNs): إشعار مرئي + صوت.
    // نُبقي كتلة notification حاضرة دائمًا حتى يعرضها نظام التشغيل تلقائيًا
    // (display message) دون الاعتماد على كون التطبيق نشطًا.
    const res = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: stringData,
      android: {
        priority: 'high',
        notification: {
          channelId: 'yalla_orders',
          sound: 'default',
          defaultSound: true,
          priority: 'high',
        },
      },
      apns: {
        headers: { 'apns-priority': '10' },
        payload: { aps: { sound: 'default', contentAvailable: true } },
      },
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

// إشعار كل الكباتن بطلب جديد مبثوث (الإسناد التلقائي) — يُوقظهم حتى والتطبيق مغلق
// ليتسابقوا على قبوله. يأخذه أوّل من يقبل ثم يختفي من الباقين.
function orderBroadcastPayload(order) {
  return {
    title: '🚨 طلب جديد متاح',
    body: `استلام من: ${order.pickup?.address || 'موقع الاستلام'} — سارع بالقبول قبل غيرك!`,
    data: { type: 'ORDER_BROADCAST', orderId: String(order._id) },
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

// إشعار صاحب الطلب برمز التسليم (Card 20) — يعطيه للكابتن عند الاستلام
function deliveryCodePayload(order, code) {
  return {
    title: '🔑 رمز تسليم طلبك',
    body: `رمزك هو ${code} — أعطِه للكابتن عند استلام الطلب لتأكيد التسليم`,
    data: { type: 'DELIVERY_CODE', orderId: String(order._id), code: String(code) },
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

// ── Card 103: حمولات إشعارات الأدمن (نسخة أندرويد للوحة الأدمن) ──────
// دوال نقيّة تبني نصّ الإشعار الذي يصل لجهاز الأدمن ليتحرّك فورًا.

// إشعار الأدمن بطلب جديد بحاجة لإسناد كابتن
function newOrderAdminPayload(order) {
  const from = order.pickup?.address || 'موقع الاستلام';
  const to = order.dropoff?.address || 'موقع التسليم';
  return {
    title: '🚴 طلب جديد',
    body: `من: ${from}\nإلى: ${to}`,
    data: { type: 'ADMIN_NEW_ORDER', orderId: String(order._id) },
  };
}

// إشعار الأدمن بأنّ طلبًا رُفض/انتهت مهلته وعاد بحاجة لإعادة إسناد
function orderNeedsReassignAdminPayload(order) {
  const from = order.pickup?.address || 'موقع الاستلام';
  return {
    title: '🔁 طلب يحتاج إعادة إسناد',
    body: `طلب عاد إلى قائمة الانتظار — من: ${from}`,
    data: { type: 'ADMIN_ORDER_REASSIGN', orderId: String(order._id) },
  };
}

// إشعار الأدمن بطلب سحب رصيد (كابتن/عميل) بحاجة للمراجعة
function withdrawalAdminPayload({ who, name, amount }) {
  const label = who === 'captain' ? 'كابتن' : 'عميل';
  return {
    title: '💸 طلب سحب رصيد',
    body: `طلب سحب من ${label}${name ? ` (${name})` : ''}${amount ? ` بمبلغ ${amount}` : ''} بانتظار المراجعة`,
    data: { type: 'ADMIN_WITHDRAWAL', who: String(who || '') },
  };
}

// ── Card 105: حمولات إشعارات أدمن إضافية (نسخة أندرويد للوحة الأدمن) ──

// إشعار الأدمن بطلب شحن رصيد (إضافة رصيد) من زبون بحاجة للموافقة
function topupRequestAdminPayload({ name, amount, method } = {}) {
  return {
    title: '💰 طلب شحن رصيد',
    body: `طلب شحن${name ? ` من ${name}` : ''}${amount ? ` بمبلغ ${amount}` : ''}${
      method ? ` عبر ${method}` : ''
    } بانتظار الموافقة`,
    data: { type: 'ADMIN_TOPUP_REQUEST', method: String(method || '') },
  };
}

// إشعار الأدمن برسالة دعم جديدة من زبون
function supportMessageAdminPayload({ name, text } = {}) {
  const preview = String(text || '').trim();
  return {
    title: '📨 رسالة دعم جديدة',
    body: `${name ? `${name}: ` : ''}${
      preview.length > 80 ? `${preview.slice(0, 80)}…` : preview || 'رسالة جديدة'
    }`,
    data: { type: 'ADMIN_SUPPORT_MESSAGE' },
  };
}

// إشعار الأدمن بتسجيل زبون جديد
function newUserAdminPayload(user = {}) {
  const name = [user.name, user.lastName].filter(Boolean).join(' ').trim();
  return {
    title: '🧑 زبون جديد',
    body: `انضمّ زبون جديد${name ? `: ${name}` : ''}${user.phone ? ` (${user.phone})` : ''}`,
    data: { type: 'ADMIN_NEW_USER', userId: user._id ? String(user._id) : '' },
  };
}

// إشعار الأدمن بطلب توثيق كابتن جديد (حساب كابتن جديد بحاجة لمراجعة)
function newCaptainApplicationAdminPayload(app = {}) {
  return {
    title: '🛵 طلب كابتن جديد',
    body: `طلب توثيق كابتن جديد${app.fullName ? `: ${app.fullName}` : ''}${
      app.phone ? ` (${app.phone})` : ''
    } بانتظار المراجعة`,
    data: { type: 'ADMIN_NEW_CAPTAIN', applicationId: app._id ? String(app._id) : '' },
  };
}

// ── إشعارات داخل التطبيق (In-App) ─────────────────────────────

// غرفة السوكت المناسبة لدور المستلِم (لبثّ الإشعار لحظيًا)
function recipientRoom(recipientId, recipientRole) {
  if (recipientRole === ROLES.CAPTAIN) return ROOMS.captain(String(recipientId));
  if (recipientRole === ROLES.ADMIN) return ROOMS.admins();
  return ROOMS.user(String(recipientId));
}

// إنشاء إشعار داخلي للمستلِم (آمن: لا يرمي أخطاءً تُوقف التدفّق الأساسي)
async function createInApp(recipientId, recipientRole, payload) {
  try {
    const notif = await Notification.create({
      recipient: recipientId,
      recipientRole,
      type: payload.data?.type || 'GENERAL',
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
    });

    // بثّ لحظي للمستلِم ليظهر الإشعار فورًا دون تحديث الصفحة
    try {
      io.get().to(recipientRoom(recipientId, recipientRole)).emit(EVENTS.NOTIFICATION_NEW, notif);
    } catch (_) {
      // السوكت غير مهيّأ (مثلًا في الاختبارات) — نتجاهل بأمان
    }
  } catch (err) {
    logger.warn('تعذّر إنشاء إشعار داخلي:', err.message);
  }
}

// ── رسائل/إشعارات الأدمن الجماعية (Card 66) ───────────────────────

// بناء مُرشِّح المستلِمين لفئة معيّنة حسب الجمهور والقائمة المحدّدة
function recipientFilter(audience, ids) {
  return audience === BROADCAST_AUDIENCE.SPECIFIC ? { _id: { $in: ids } } : {};
}

/**
 * Card 103: إشعار كلّ المشرفين (الأدمن) بحدث يخصّهم (طلب جديد، سحب رصيد...).
 * يُنشئ إشعارًا داخليًا لكل مشرف، ويبثّه لحظيًا لغرفة الأدمن، ويرسل Push إلى
 * أجهزتهم المسجَّلة (آمن: no-op إن كان FCM معطّلًا). هكذا يصل الإشعار إلى نسخة
 * أندرويد من لوحة الأدمن حتى والتطبيق مغلق.
 * @param {{title:string, body:string, data?:object}} payload
 * @returns {Promise<{admins:number, push:number}>}
 */
async function notifyAdmins(payload = {}) {
  const title = String(payload.title || '').trim();
  const body = String(payload.body || '').trim();
  const data = payload.data || {};

  const admins = await User.find({ role: ROLES.ADMIN }).select('_id deviceTokens').lean();
  if (!admins.length) return { admins: 0, push: 0 };

  // إشعار داخلي لكلّ مشرف (لصفحة الإشعارات الخاصّة به) + تجميع رموز الأجهزة
  const notifDocs = [];
  const tokens = [];
  for (const a of admins) {
    notifDocs.push({
      recipient: a._id,
      recipientRole: ROLES.ADMIN,
      type: data.type || 'ADMIN_ALERT',
      title,
      body,
      data,
    });
    if (Array.isArray(a.deviceTokens)) tokens.push(...a.deviceTokens);
  }

  // حفظ الإشعارات الداخلية دفعةً واحدة ثم بثّها مرّة واحدة لغرفة الأدمن
  // (كلّ المشرفين يتشاركون غرفة واحدة، فنبثّ حدثًا واحدًا لتفادي التكرار)
  try {
    const created = await Notification.insertMany(notifDocs);
    try {
      if (created.length) {
        io.get().to(ROOMS.admins()).emit(EVENTS.NOTIFICATION_NEW, created[0]);
      }
    } catch (_) {
      // السوكت غير مهيّأ (اختبارات) — نتجاهل بأمان
    }
  } catch (err) {
    logger.warn('تعذّر إنشاء إشعارات الأدمن الداخلية:', err.message);
  }

  // إشعار Push لأجهزة الأدمن (آمن إن كان FCM معطّلًا)
  let pushSent = 0;
  const uniqueTokens = [...new Set(tokens.filter(Boolean))];
  if (uniqueTokens.length) {
    const res = await sendToTokens(uniqueTokens, { title, body, data });
    pushSent = res.sent || 0;
  }

  return { admins: admins.length, push: pushSent };
}

/**
 * إرسال رسالة/إشعار جماعي من الأدمن (Card 66):
 * يُنشئ إشعارًا داخليًا لكل مستلِم، ويبثّه لحظيًا عبر السوكت، ويرسل Push (آمن بلا FCM).
 * @param {{audience:string, title:string, body:string, userIds?:string[], captainIds?:string[]}} p
 * @returns {Promise<{users:number, captains:number, push:number}>}
 */
async function sendBroadcast(p = {}) {
  const { audience } = p;
  const title = String(p.title || '').trim();
  const rawBody = String(p.body || '').trim();
  const userIds = Array.isArray(p.userIds) ? p.userIds : [];
  const captainIds = Array.isArray(p.captainIds) ? p.captainIds : [];

  // Card 66: نوسم الرسالة بأنّها من المشرف ليعرف المستلِم مصدرها
  const SENDER_LABEL = '📢 رسالة من المشرف';
  const body = rawBody ? `${SENDER_LABEL}\n${rawBody}` : SENDER_LABEL;

  const data = { type: 'ADMIN_MESSAGE', fromAdmin: true };
  const notifDocs = [];
  const tokens = [];
  let userCount = 0;
  let captainCount = 0;

  // الزبائن المستهدفون
  if (includesUsers(audience, userIds)) {
    const users = await User.find({ role: ROLES.USER, ...recipientFilter(audience, userIds) })
      .select('deviceTokens')
      .lean();
    userCount = users.length;
    for (const u of users) {
      notifDocs.push({ recipient: u._id, recipientRole: 'user', type: 'ADMIN_MESSAGE', title, body, data });
      if (Array.isArray(u.deviceTokens)) tokens.push(...u.deviceTokens);
    }
  }

  // الكباتن المستهدفون
  if (includesCaptains(audience, captainIds)) {
    const captains = await Captain.find(recipientFilter(audience, captainIds))
      .select('deviceTokens')
      .lean();
    captainCount = captains.length;
    for (const c of captains) {
      notifDocs.push({ recipient: c._id, recipientRole: 'captain', type: 'ADMIN_MESSAGE', title, body, data });
      if (Array.isArray(c.deviceTokens)) tokens.push(...c.deviceTokens);
    }
  }

  // حفظ الإشعارات الداخلية دفعةً واحدة، ثم بثّها لحظيًا لكل مستلِم
  if (notifDocs.length) {
    const created = await Notification.insertMany(notifDocs);
    try {
      const io_ = io.get();
      for (const notif of created) {
        io_.to(recipientRoom(notif.recipient, notif.recipientRole)).emit(EVENTS.NOTIFICATION_NEW, notif);
      }
    } catch (_) {
      // السوكت غير مهيّأ (اختبارات) — نتجاهل بأمان
    }
  }

  // إشعار Push لكل الأجهزة (آمن: no-op إن كان FCM معطّلًا)
  let pushSent = 0;
  const uniqueTokens = [...new Set(tokens.filter(Boolean))];
  if (uniqueTokens.length) {
    const res = await sendToTokens(uniqueTokens, { title, body, data });
    pushSent = res.sent || 0;
  }

  return { users: userCount, captains: captainCount, push: pushSent };
}

// قائمة إشعارات المستلِم + عدد غير المقروء
async function listForRecipient(recipientId, { limit = 30 } = {}) {
  const items = await Notification.find({ recipient: recipientId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  return { items, unread: unreadCount(items) };
}

// تعليم إشعار واحد كمقروء (لمالكه فقط)
async function markRead(recipientId, notificationId) {
  const notif = await Notification.findOneAndUpdate(
    { _id: notificationId, recipient: recipientId },
    { read: true },
    { new: true }
  );
  if (!notif) throw Object.assign(new Error('الإشعار غير موجود'), { statusCode: 404 });
  return notif;
}

// تعليم كل إشعارات المستلِم كمقروءة
async function markAllRead(recipientId) {
  const res = await Notification.updateMany(
    { recipient: recipientId, read: false },
    { read: true }
  );
  return { updated: res.modifiedCount };
}

module.exports = {
  isEnabled,
  sendToTokens,
  orderAssignedPayload,
  orderBroadcastPayload,
  orderStatusPayload,
  orderCancelledPayload,
  deliveryCodePayload,
  newOrderAdminPayload,
  orderNeedsReassignAdminPayload,
  withdrawalAdminPayload,
  topupRequestAdminPayload,
  supportMessageAdminPayload,
  newUserAdminPayload,
  newCaptainApplicationAdminPayload,
  createInApp,
  notifyAdmins,
  sendBroadcast,
  listForRecipient,
  markRead,
  markAllRead,
};
