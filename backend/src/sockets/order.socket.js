'use strict';

const Captain = require('../models/Captain');
const Order = require('../models/Order');
const { verifyAccessToken } = require('../middlewares/auth.middleware');
const orderService = require('../services/order.service');
const chatService = require('../services/chat.service');
const ioRef = require('./io');
const logger = require('../utils/logger');
const { ROLES, ROOMS, EVENTS, CAPTAIN_STATUS } = require('../utils/constants');

/**
 * Middleware للمصادقة على مستوى السوكت: نستخدم نفس سياسة JWT والحسابات
 * المطبّقة على REST حتى لا تكون قناة Socket.io أضعف من HTTP.
 */
async function socketAuth(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('التوكن مفقود'));
    socket.user = await verifyAccessToken(token);
    next();
  } catch (err) {
    next(new Error('توكن غير صالح أو الحساب غير متاح'));
  }
}

async function canJoinOrderRoom(user, orderId) {
  if (!orderId || !user?.id || !user?.role) return false;
  if (user.role === ROLES.ADMIN) return true;

  const order = await Order.findById(orderId)
    .select('user captain store.restaurant')
    .lean();
  if (!order) return false;

  const actorId = String(user.id);
  if (user.role === ROLES.USER) return String(order.user || '') === actorId;
  if (user.role === ROLES.CAPTAIN) return String(order.captain || '') === actorId;
  if (user.role === ROLES.MERCHANT) {
    return Boolean(user.restaurantId) && String(order.store?.restaurant || '') === String(user.restaurantId);
  }
  return false;
}

/**
 * تسجيل كل معالجات أحداث السوكت.
 * @param {import('socket.io').Server} io
 */
function registerSocketHandlers(io) {
  ioRef.set(io);
  io.use(socketAuth);

  io.on('connection', (socket) => {
    const { id, role } = socket.user;
    logger.info(`🔌 اتصال جديد: ${role}:${id} (${socket.id})`);

    if (role === ROLES.ADMIN) socket.join(ROOMS.admins());
    if (role === ROLES.CAPTAIN) {
      socket.join(ROOMS.captain(id));
      socket.join(ROOMS.captains());
    }
    if (role === ROLES.USER) socket.join(ROOMS.user(id));
    if (role === ROLES.MERCHANT && socket.user.restaurantId) {
      socket.join(ROOMS.merchant(socket.user.restaurantId));
      socket.join(ROOMS.merchantAccount(id));
    }

    // لا نسمح بالاشتراك في غرفة طلب بالـID فقط؛ يجب أن يكون المستخدم طرفًا
    // في الطلب أو أدمنًا. هذا يمنع الاستماع لموقع/أحداث طلبات الآخرين.
    socket.on('order:join', async ({ orderId } = {}, ack) => {
      try {
        if (!(await canJoinOrderRoom(socket.user, orderId))) {
          return ack?.({ ok: false, error: 'غير مصرّح لهذا الطلب' });
        }
        await socket.join(ROOMS.order(orderId));
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: 'تعذّر الانضمام للطلب' });
      }
    });

    socket.on(EVENTS.CAPTAIN_TOGGLE_STATUS, async ({ status }, ack) => {
      try {
        if (role !== ROLES.CAPTAIN) throw new Error('غير مصرّح');

        if (status === CAPTAIN_STATUS.OFFLINE) {
          const captain = await orderService.setCaptainOffline(id);
          return ack?.({ ok: true, status: captain.status });
        }

        const captain = await Captain.findByIdAndUpdate(id, { status }, { new: true });
        io.to(ROOMS.admins()).emit(EVENTS.CAPTAIN_STATUS_CHANGED, {
          captainId: id,
          status: captain.status,
        });
        ack?.({ ok: true, status: captain.status });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on(EVENTS.CAPTAIN_UPDATE_LOCATION, async ({ orderId, lng, lat }) => {
      if (role !== ROLES.CAPTAIN) return;
      Captain.updateOne(
        { _id: id },
        { currentLocation: { type: 'Point', coordinates: [lng, lat], updatedAt: new Date() } }
      ).catch((e) => logger.error(e.message));

      io.to(ROOMS.order(orderId)).to(ROOMS.admins()).emit(EVENTS.CAPTAIN_LOCATION, {
        orderId,
        captainId: id,
        lng,
        lat,
      });
    });

    socket.on(EVENTS.ORDER_UPDATE_STATUS, async ({ orderId, status, reason, deliveryCode, finalPrice }, ack) => {
      try {
        if (role !== ROLES.CAPTAIN) throw new Error('غير مصرّح');
        const order = await orderService.updateOrderStatus(id, orderId, status, reason, deliveryCode, finalPrice);
        ack?.({ ok: true, order });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on(EVENTS.CHAT_MESSAGE, async ({ orderId, text }, ack) => {
      try {
        if (role !== ROLES.USER && role !== ROLES.CAPTAIN) throw new Error('غير مصرّح');
        const message = await chatService.sendMessage(orderId, { id, role }, text);
        ack?.({ ok: true, message });
      } catch (err) {
        ack?.({ ok: false, error: err.message });
      }
    });

    socket.on('disconnect', async () => {
      logger.info(`❎ فصل الاتصال: ${role}:${id}`);
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
module.exports.socketAuth = socketAuth;
module.exports.canJoinOrderRoom = canJoinOrderRoom;
