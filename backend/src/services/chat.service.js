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

  const senderRole = sender.role === ROLES.CAPTAIN ? 'captain' : 'user';
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

  if (senderRole === 'captain') {
    // المُرسِل كابتن → المستلِم صاحب الطلب
    notifications.createInApp(order.user, 'user', payload);
    const user = await User.findById(order.user).select('deviceTokens');
    if (user?.deviceTokens?.length) await notifications.sendToTokens(user.deviceTokens, payload);
  } else if (order.captain) {
    // المُرسِل صاحب الطلب → المستلِم الكابتن
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
  return Message.find({ order: orderId }).sort({ createdAt: 1 }).limit(limit).lean();
}

/**
 * حذف كل رسائل الطلب — يُستدعى عند التسليم أو الإلغاء (Card 18).
 * آمن: لا يرمي أخطاءً تُوقف تدفّق تغيير حالة الطلب.
 * @returns {Promise<number>} عدد الرسائل المحذوفة
 */
async function purgeOrderMessages(orderId) {
  try {
    const res = await Message.deleteMany({ order: orderId });
    try {
      io.get().to(ROOMS.order(String(orderId))).emit(EVENTS.CHAT_CLEARED, { orderId: String(orderId) });
    } catch (_) {
      // السوكت غير مهيّأ — نتجاهل
    }
    return res.deletedCount || 0;
  } catch (err) {
    logger.warn('تعذّر حذف رسائل الطلب:', err.message);
    return 0;
  }
}

module.exports = { sendMessage, listMessages, purgeOrderMessages };
