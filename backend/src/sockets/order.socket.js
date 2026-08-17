'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const Captain = require('../models/Captain');
const orderService = require('../services/order.service');
const chatService = require('../services/chat.service');
const ioRef = require('./io');
const logger = require('../utils/logger');
const { ROLES, ROOMS, EVENTS, CAPTAIN_STATUS } = require('../utils/constants');

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

        // عند "غير متصل": إن كان لديه طلب لم يُستَلم بعد يُرفَض ويعود للأدمن (Card 16)
        if (status === CAPTAIN_STATUS.OFFLINE) {
          const captain = await orderService.setCaptainOffline(id);
          return ack?.({ ok: true, status: captain.status });
        }

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
    socket.on(EVENTS.ORDER_UPDATE_STATUS, async ({ orderId, status, reason, deliveryCode, finalPrice }, ack) => {
      try {
        if (role !== ROLES.CAPTAIN) throw new Error('غير مصرّح');
        // نمرّر رمز التسليم + السعر الحقيقي للتحقّق عند "تم التسليم" (Card 20 + 27)
        const order = await orderService.updateOrderStatus(id, orderId, status, reason, deliveryCode, finalPrice);
        ack?.({ ok: true, order });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    // ── دردشة الطلب: صاحب الطلب/الكابتن يرسل رسالة لحظيًا (Card 18) ──
    socket.on(EVENTS.CHAT_MESSAGE, async ({ orderId, text }, ack) => {
      try {
        if (role !== ROLES.USER && role !== ROLES.CAPTAIN) throw new Error('غير مصرّح');
        // الخدمة تتحقّق من العضويّة والحالة والنصّ، وتبثّ لغرفة الطلب
        const message = await chatService.sendMessage(orderId, { id, role }, text);
        ack?.({ ok: true, message });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on('disconnect', async () => {
      logger.info(`❎ فصل الاتصال: ${role}:${id}`);
      // Card 15: الكابتن غير المتصل يجب ألّا يظهر "متاحًا" في لوحة الأدمن.
      // عند فقد اتصال كابتن متاح (online) وبلا طلب نشط — إغلاق التطبيق/انقطاع الشبكة —
      // نعتبره غير متصل فورًا ونُعلم الأدمن. أمّا الكابتن المشغول بطلب (busy) فنُبقيه
      // كما هو حتى لا نُفسد توصيلًا جاريًا عند انقطاع لحظي.
      if (role !== ROLES.CAPTAIN) return;
      try {
        const captain = await Captain.findById(id).select('status activeOrder');
        if (captain && captain.status === CAPTAIN_STATUS.ONLINE && !captain.activeOrder) {
          await Captain.findByIdAndUpdate(id, { status: CAPTAIN_STATUS.OFFLINE });
          io.to(ROOMS.admins()).emit(EVENTS.CAPTAIN_STATUS_CHANGED, {
            captainId: id,
            status: CAPTAIN_STATUS.OFFLINE,
          });
        }
      } catch (err) {
        logger.error(`فشل ضبط الكابتن غير متصل عند الفصل: ${err.message}`);
      }
    });
  });
}

module.exports = registerSocketHandlers;
