'use strict';

const mongoose = require('mongoose');
const SupportMessage = require('../models/SupportMessage');
const User = require('../models/User');
const io = require('../sockets/io');
const logger = require('../utils/logger');
const notifications = require('./notification.service');
const { validateMessage } = require('../utils/chat');
const { ROOMS, EVENTS } = require('../utils/constants');

/**
 * التواصل المباشر بين الزبون والأدمن (Card 44 + Card 46).
 * لكل زبون سلسلة محادثة واحدة مع الأدمن. الأدمن يرى كل السلاسل ويردّ عليها.
 */

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

/** رسائل محادثة الدعم لزبون معيّن (الأقدم أولًا). */
async function listMessages(userId, { limit = 200 } = {}) {
  return SupportMessage.find({ user: userId }).sort({ createdAt: 1 }).limit(limit).lean();
}

/** الزبون يرسل رسالة للأدمن. تُبثّ للأدمن لحظيًا وتظهر في لوحته. */
async function userSend(userId, text) {
  const invalid = validateMessage(text);
  if (invalid) throw httpError(invalid, 400);

  const message = await SupportMessage.create({
    user: userId,
    senderRole: 'user',
    text: text.trim(),
    read: false,
  });

  // بثّ للزبون (أجهزته الأخرى) وللأدمن
  emit(ROOMS.user(String(userId)), message);
  emit(ROOMS.admins(), message);
  return message;
}

/** الأدمن يردّ على زبون. يُشعر الزبون (داخل التطبيق + Push) ويبثّ لحظيًا. */
async function adminReply(userId, text) {
  if (!mongoose.Types.ObjectId.isValid(userId)) throw httpError('معرّف غير صالح', 400);
  const invalid = validateMessage(text);
  if (invalid) throw httpError(invalid, 400);

  const user = await User.findById(userId).select('deviceTokens');
  if (!user) throw httpError('الزبون غير موجود', 404);

  const message = await SupportMessage.create({
    user: userId,
    senderRole: 'admin',
    text: text.trim(),
    read: false,
  });

  emit(ROOMS.user(String(userId)), message);
  emit(ROOMS.admins(), message);

  // إشعار الزبون بردّ الدعم (يصل حتى خارج الشاشة)
  const payload = {
    title: '📨 ردّ من الدعم',
    body: message.text.length > 80 ? `${message.text.slice(0, 80)}…` : message.text,
    data: { type: 'SUPPORT_MESSAGE' },
  };
  notifications.createInApp(userId, 'user', payload);
  if (user.deviceTokens?.length) {
    notifications
      .sendToTokens(user.deviceTokens, payload)
      .catch((e) => logger.warn('تعذّر إشعار الزبون بردّ الدعم:', e.message));
  }
  return message;
}

/**
 * قائمة سلاسل الدعم للأدمن (Card 46): سلسلة لكل زبون مع آخر رسالة وعدد
 * الرسائل غير المقروءة الواردة من الزبون.
 */
async function listThreads({ limit = 100 } = {}) {
  const agg = await SupportMessage.aggregate([
    { $sort: { createdAt: 1 } },
    {
      $group: {
        _id: '$user',
        lastText: { $last: '$text' },
        lastAt: { $last: '$createdAt' },
        lastSender: { $last: '$senderRole' },
        unread: {
          $sum: {
            $cond: [{ $and: [{ $eq: ['$senderRole', 'user'] }, { $eq: ['$read', false] }] }, 1, 0],
          },
        },
      },
    },
    { $sort: { lastAt: -1 } },
    { $limit: limit },
  ]);
  if (!agg.length) return [];

  const users = await User.find({ _id: { $in: agg.map((a) => a._id) } })
    .select('name lastName phone')
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));

  return agg.map((a) => {
    const u = byId.get(String(a._id));
    return {
      userId: String(a._id),
      name: u ? [u.name, u.lastName].filter(Boolean).join(' ') : 'زبون محذوف',
      phone: u?.phone || '',
      lastText: a.lastText,
      lastAt: a.lastAt,
      lastSender: a.lastSender,
      unread: a.unread,
    };
  });
}

/** الأدمن يفتح سلسلة زبون: يجلب الرسائل ويعلّم الواردة منه كمقروءة. */
async function adminThread(userId) {
  const [messages] = await Promise.all([
    listMessages(userId),
    SupportMessage.updateMany({ user: userId, senderRole: 'user', read: false }, { $set: { read: true } }),
  ]);
  return messages;
}

// بثّ رسالة لغرفة محدّدة بأمان (يتجاهل غياب السوكت في الاختبارات)
function emit(room, message) {
  try {
    io.get().to(room).emit(EVENTS.SUPPORT_MESSAGE, message);
  } catch (_) {
    /* السوكت غير مهيّأ */
  }
}

module.exports = { listMessages, userSend, adminReply, listThreads, adminThread };
