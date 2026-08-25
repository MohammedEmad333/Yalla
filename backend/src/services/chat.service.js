'use strict';

const Order = require('../models/Order');
const Message = require('../models/Message');
const Captain = require('../models/Captain');
const User = require('../models/User');
const io = require('../sockets/io');
const logger = require('../utils/logger');
const notifications = require('./notification.service');
const { canChat, validateMessage } = require('../utils/chat');
const { ROLES, ROOMS, EVENTS } = require('../utils/constants');

/**
 * خدمة الدردشة بين صاحب الطلب والكابتن (Card 18).
 * الوصول محصور بطرفَي الطلب (المالك + الكابتن المُسنَد)، والإرسال متاح فقط
 * خلال فترة التوصيل. تُحذف كل رسائل الطلب بمجرّد تسليمه أو إلغائه.
 */

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

// جلب الطلب والتحقّق من أنّ الطالب طرف فيه (المالك أو الكابتن المُسنَد)
async function loadOrderForParticipant(orderId, requesterId, requesterRole) {
  const order = await Order.findById(orderId).select('user captain status');
  if (!order) throw httpError('الطلب غير موجود', 404);

  const isOwner = String(order.user) === String(requesterId);
  const isAssignedCaptain =
    order.captain && String(order.captain) === String(requesterId);
  const isAdmin = requesterRole === ROLES.ADMIN;
  if (!isOwner && !isAssignedCaptain && !isAdmin) {
    throw httpError('غير مصرّح بالوصول لدردشة هذا الطلب', 403);
  }
  return { order, isOwner, isAssignedCaptain };
}

/**
 * إرسال رسالة على طلب. يتحقّق من العضويّة، من صلاحية الحالة للدردشة،
 * ومن نصّ الرسالة. يبثّها لحظيًا لغرفة الطلب ويُشعر الطرف الآخر.
 */
async function sendMessage(orderId, sender, text) {
  const { order } = await loadOrderForParticipant(orderId, sender.id, sender.role);

  if (!canChat(order.status)) {
    throw httpError('الدردشة متاحة خلال فترة التوصيل فقط', 400);
  }
  const invalid = validateMessage(text);
  if (invalid) throw httpError(invalid, 400);

  const senderRole =
    sender.role === ROLES.CAPTAIN ? 'captain' : sender.role === ROLES.ADMIN ? 'admin' : 'user';
  const message = await Message.create({
    order: orderId,
    senderId: sender.id,
    senderRole,
    text: text.trim(),
  });

  // بثّ لحظي لغرفة الطلب (يستقبله الطرفان المنضمّان لها)
  try {
    io.get().to(ROOMS.order(String(orderId))).emit(EVENTS.CHAT_MESSAGE, message);
  } catch (_) {
    // السوكت غير مهيّأ (اختبارات) — نتجاهل بأمان
  }

  // إشعار الطرف الآخر (داخل التطبيق + Push) ليصله التنبيه حتى خارج شاشة الدردشة
  notifyOtherParty(order, senderRole, message).catch((e) =>
    logger.warn('تعذّر إشعار الطرف الآخر بالرسالة:', e.message)
  );

  return message;
}

// إشعار الطرف المقابل للمُرسِل برسالة جديدة
async function notifyOtherParty(order, senderRole, message) {
  const payload = {
    title: '💬 رسالة جديدة',
    body: message.text.length > 80 ? `${message.text.slice(0, 80)}…` : message.text,
    data: { type: 'CHAT_MESSAGE', orderId: String(order._id) },
  };

  // المُرسِل كابتن → صاحب الطلب فقط | المُرسِل صاحب الطلب → الكابتن فقط |
  // المُرسِل أدمن (Card 32) → الطرفان معًا.
  const notifyUser = senderRole !== 'user';
  const notifyCaptain = senderRole !== 'captain' && order.captain;

  if (notifyUser) {
    notifications.createInApp(order.user, 'user', payload);
    const user = await User.findById(order.user).select('deviceTokens');
    if (user?.deviceTokens?.length) await notifications.sendToTokens(user.deviceTokens, payload);
  }
  if (notifyCaptain) {
    notifications.createInApp(order.captain, 'captain', payload);
    const captain = await Captain.findById(order.captain).select('deviceTokens');
    if (captain?.deviceTokens?.length) {
      await notifications.sendToTokens(captain.deviceTokens, payload);
    }
  }
}

/** قائمة رسائل الطلب (الأقدم أولًا) — لأطراف الطلب فقط. */
async function listMessages(orderId, requester, { limit = 100 } = {}) {
  await loadOrderForParticipant(orderId, requester.id, requester.role);
  // الأدمن يرى كل الرسائل (بما فيها المؤرشفة)؛ الطرفان يريان غير المؤرشفة فقط.
  const filter = { order: orderId };
  if (requester.role !== ROLES.ADMIN) filter.archived = { $ne: true };
  return Message.find(filter).sort({ createdAt: 1 }).limit(limit).lean();
}

/**
 * أرشفة كل رسائل الطلب — يُستدعى عند التسليم أو الإلغاء (Card 18 + Card 32).
 * يفقد الطرفان (المستخدم/الكابتن) الوصول إليها فورًا (خصوصيّة)، بينما تبقى
 * محفوظة للأدمن للمراقبة وتصدير CSV بعد انتهاء المحادثة.
 * آمن: لا يرمي أخطاءً تُوقف تدفّق تغيير حالة الطلب.
 * @returns {Promise<number>} عدد الرسائل المؤرشَفة
 */
async function purgeOrderMessages(orderId) {
  try {
    const res = await Message.updateMany(
      { order: orderId, archived: { $ne: true } },
      { $set: { archived: true } }
    );
    try {
      io.get().to(ROOMS.order(String(orderId))).emit(EVENTS.CHAT_CLEARED, { orderId: String(orderId) });
    } catch (_) {
      // السوكت غير مهيّأ — نتجاهل
    }
    return res.modifiedCount || 0;
  } catch (err) {
    logger.warn('تعذّر أرشفة رسائل الطلب:', err.message);
    return 0;
  }
}

// ── مراقبة الأدمن للمحادثات (Card 32 + Card 45) ──────────────────

/**
 * Card 45: قائمة المحادثات الجارية (طلبات نشطة تحمل رسائل غير مؤرشفة)
 * ليدخل إليها الأدمن بسهولة — مع آخر رسالة وعدد الرسائل وطرفَي المحادثة.
 */
async function listActiveChats({ limit = 50 } = {}) {
  const agg = await Message.aggregate([
    { $match: { archived: { $ne: true } } },
    { $sort: { createdAt: 1 } },
    {
      $group: {
        _id: '$order',
        count: { $sum: 1 },
        lastText: { $last: '$text' },
        lastAt: { $last: '$createdAt' },
        lastSender: { $last: '$senderRole' },
      },
    },
    { $sort: { lastAt: -1 } },
    { $limit: limit },
  ]);
  if (!agg.length) return [];

  const orderIds = agg.map((a) => a._id);
  const orders = await Order.find({ _id: { $in: orderIds } })
    .select('status user captain')
    .populate('user', 'name lastName phone')
    .populate('captain', 'name phone')
    .lean();
  const byId = new Map(orders.map((o) => [String(o._id), o]));

  return agg.map((a) => {
    const o = byId.get(String(a._id)) || {};
    return {
      orderId: String(a._id),
      status: o.status || 'unknown',
      user: o.user
        ? { name: [o.user.name, o.user.lastName].filter(Boolean).join(' '), phone: o.user.phone }
        : null,
      captain: o.captain ? { name: o.captain.name, phone: o.captain.phone } : null,
      messages: a.count,
      lastText: a.lastText,
      lastAt: a.lastAt,
      lastSender: a.lastSender,
    };
  });
}

/** رسائل طلب معيّن للأدمن (تشمل المؤرشفة) — للمراقبة والتصدير. */
async function listMessagesForAdmin(orderId, { limit = 500 } = {}) {
  return Message.find({ order: orderId }).sort({ createdAt: 1 }).limit(limit).lean();
}

/**
 * Card 94: حذف الأدمن لرسالة دردشة واحدة نهائيًا (من أي محادثة). يُزيلها من
 * الذاكرة ويبثّ حدثًا لغرفة الطلب ليختفي فورًا لدى الطرفين المتّصلين.
 * @param {string} orderId
 * @param {string} messageId
 * @returns {Promise<{ deleted: true, id: string, orderId: string }>}
 */
async function deleteMessage(orderId, messageId) {
  const message = await Message.findOne({ _id: messageId, order: orderId });
  if (!message) throw httpError('الرسالة غير موجودة', 404);

  await Message.deleteOne({ _id: messageId });

  try {
    io.get()
      .to(ROOMS.order(String(orderId)))
      .emit(EVENTS.CHAT_MESSAGE_DELETED, { id: String(messageId), orderId: String(orderId) });
  } catch (_) {
    // السوكت غير مهيّأ (اختبارات) — نتجاهل بأمان
  }

  return { deleted: true, id: String(messageId), orderId: String(orderId) };
}

module.exports = {
  sendMessage,
  listMessages,
  purgeOrderMessages,
  listActiveChats,
  listMessagesForAdmin,
  deleteMessage,
};
