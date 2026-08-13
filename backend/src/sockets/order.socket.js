'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const Captain = require('../models/Captain');
const orderService = require('../services/order.service');
const ioRef = require('./io');
const logger = require('../utils/logger');
const { ROLES, ROOMS, EVENTS } = require('../utils/constants');

/**
 * Middleware للمصادقة على مستوى السوكت: نتحقّق من التوكن المُرسل في
 * handshake.auth.token ونرفق هويّة العميل بالـ socket.
 */
function socketAuth(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('التوكن مفقود'));
    socket.user = jwt.verify(token, env.jwtSecret); // { id, role }
    next();
  } catch (err) {
    next(new Error('توكن غير صالح'));
  }
}

/**
 * تسجيل كل معالجات أحداث السوكت.
 * @param {import('socket.io').Server} io
 */
function registerSocketHandlers(io) {
  ioRef.set(io);            // إتاحة io لبقية الطبقات
  io.use(socketAuth);       // فرض المصادقة على كل اتصال

  io.on('connection', (socket) => {
    const { id, role } = socket.user;
    logger.info(`🔌 اتصال جديد: ${role}:${id} (${socket.id})`);

    // ضمّ العميل إلى الغرفة المناسبة لدوره
    if (role === ROLES.ADMIN) socket.join(ROOMS.admins());
    if (role === ROLES.CAPTAIN) socket.join(ROOMS.captain(id));
    if (role === ROLES.USER) socket.join(ROOMS.user(id));

    // المستخدم/الكابتن ينضمّ لغرفة طلب معيّن لمتابعته لحظيًا
    socket.on('order:join', ({ orderId }) => socket.join(ROOMS.order(orderId)));

    // ── الكابتن يبدّل حالته (online/offline) ──────────────────────
    socket.on(EVENTS.CAPTAIN_TOGGLE_STATUS, async ({ status }, ack) => {
      try {
        if (role !== ROLES.CAPTAIN) throw new Error('غير مصرّح');
        const captain = await Captain.findByIdAndUpdate(id, { status }, { new: true });
        // إعلام الأدمن لتحديث قائمة الكباتن المتاحين
        io.to(ROOMS.admins()).emit(EVENTS.CAPTAIN_STATUS_CHANGED, {
          captainId: id,
          status: captain.status,
        });
        ack?.({ ok: true, status: captain.status });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // ── الكابتن يبثّ موقعه أثناء التوصيل ──────────────────────────
    socket.on(EVENTS.CAPTAIN_UPDATE_LOCATION, async ({ orderId, lng, lat }) => {
      if (role !== ROLES.CAPTAIN) return;
      // تحديث الموقع في القاعدة (بدون انتظار — throttle موصى به على العميل)
      Captain.updateOne(
        { _id: id },
        { currentLocation: { type: 'Point', coordinates: [lng, lat], updatedAt: new Date() } }
      ).catch((e) => logger.error(e.message));

      // بثّ الموقع لمن يتابع الطلب (المستخدم + الأدمن)
      io.to(ROOMS.order(orderId)).to(ROOMS.admins()).emit(EVENTS.CAPTAIN_LOCATION, {
        orderId,
        captainId: id,
        lng,
        lat,
      });
    });

    // ── الكابتن يحدّث حالة الطلب عبر السوكت ────────────────────────
    socket.on(EVENTS.ORDER_UPDATE_STATUS, async ({ orderId, status }, ack) => {
      try {
        if (role !== ROLES.CAPTAIN) throw new Error('غير مصرّح');
        const order = await orderService.updateOrderStatus(id, orderId, status);
        ack?.({ ok: true, order });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on('disconnect', () => {
      logger.info(`❎ فصل الاتصال: ${role}:${id}`);
      // ملاحظة: لا نُحوّل الكابتن إلى offline عند فصل السوكت (إغلاق التطبيق).
      // التوفّر يبقى تحت سيطرة الكابتن عبر مفتاح الحالة فقط، فيظلّ "متصلًا"
      // ويستقبل الطلبات عبر إشعارات Push حتى والتطبيق مغلق.
    });
  });
}

module.exports = registerSocketHandlers;
