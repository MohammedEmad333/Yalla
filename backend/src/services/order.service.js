'use strict';

const Order = require('../models/Order');
const Captain = require('../models/Captain');
const Log = require('../models/Log');
const io = require('../sockets/io');
const { ORDER_STATUS, CAPTAIN_STATUS, ROOMS, EVENTS } = require('../utils/constants');

/**
 * طبقة الخدمة (Service Layer): تحتوي منطق العمل الأساسي للطلبات.
 * كل عملية هنا: (1) تحدّث قاعدة البيانات، (2) تسجّل حدثًا في Log،
 * (3) تبثّ الحدث اللحظي عبر Socket.io للأطراف المعنيّة.
 */

// تسجيل حدث في سجل الأحداث
async function writeLog({ order, actorId, actorRole, action, fromStatus, toStatus, meta }) {
  await Log.create({ order, actorId, actorRole, action, fromStatus, toStatus, meta });
}

/**
 * (1) إنشاء طلب جديد من قِبل المستخدم.
 * الحالة الابتدائية = pending، ويُبثّ للأدمن ليتولّى الإسناد يدويًا.
 */
async function createOrder(userId, payload) {
  const order = await Order.create({
    user: userId,
    pickup: payload.pickup,
    dropoff: payload.dropoff,
    packageNote: payload.packageNote,
    price: payload.price || 0,
    distanceKm: payload.distanceKm || 0,
    status: ORDER_STATUS.PENDING,
  });

  await writeLog({
    order: order._id,
    actorId: userId,
    actorRole: 'user',
    action: 'ORDER_CREATED',
    toStatus: ORDER_STATUS.PENDING,
  });

  // بثّ لكل الأدمن: طلب جديد بانتظار الإسناد + إعلام المستخدم بغرفته
  io.get().to(ROOMS.admins()).emit(EVENTS.ORDER_CREATED, order);
  io.get().to(ROOMS.user(userId)).emit(EVENTS.ORDER_STATUS_UPDATED, order);

  return order;
}

/**
 * (2) الإسناد اليدوي من قِبل الأدمن: ربط طلب pending بكابتن متاح.
 */
async function assignOrder(adminId, orderId, captainId) {
  const order = await Order.findById(orderId);
  if (!order) throw Object.assign(new Error('الطلب غير موجود'), { statusCode: 404 });
  if (order.status !== ORDER_STATUS.PENDING) {
    throw Object.assign(new Error('لا يمكن إسناد طلب ليس في حالة الانتظار'), { statusCode: 400 });
  }

  const captain = await Captain.findById(captainId);
  if (!captain) throw Object.assign(new Error('الكابتن غير موجود'), { statusCode: 404 });
  if (captain.status !== CAPTAIN_STATUS.ONLINE) {
    throw Object.assign(new Error('الكابتن غير متاح حاليًا'), { statusCode: 400 });
  }

  const from = order.status;
  order.captain = captainId;
  order.status = ORDER_STATUS.ASSIGNED;
  order.timeline.assignedAt = new Date();
  await order.save();

  // شغل الكابتن وربطه بالطلب النشط
  captain.status = CAPTAIN_STATUS.BUSY;
  captain.activeOrder = order._id;
  await captain.save();

  await writeLog({
    order: order._id,
    actorId: adminId,
    actorRole: 'admin',
    action: 'ORDER_ASSIGNED',
    fromStatus: from,
    toStatus: ORDER_STATUS.ASSIGNED,
    meta: { captainId },
  });

  const populated = await order.populate('captain', 'name phone vehicleType');

  // إشعارات لحظية: للكابتن (طلب جديد مُسنَد)، للمستخدم، وللأدمن
  io.get().to(ROOMS.captain(captainId)).emit(EVENTS.ORDER_ASSIGNED, populated);
  io.get().to(ROOMS.user(order.user.toString())).emit(EVENTS.ORDER_STATUS_UPDATED, populated);
  io.get().to(ROOMS.admins()).emit(EVENTS.ORDER_STATUS_UPDATED, populated);

  return populated;
}

/**
 * (3) تحديث حالة الطلب من قِبل الكابتن (accepted -> picked_up -> delivered).
 * نتحقّق من صحّة الانتقال ونمنع القفزات غير المنطقية.
 */
const ALLOWED_TRANSITIONS = {
  [ORDER_STATUS.ASSIGNED]: [ORDER_STATUS.ACCEPTED, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.ACCEPTED]: [ORDER_STATUS.PICKED_UP, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PICKED_UP]: [ORDER_STATUS.DELIVERED],
};

async function updateOrderStatus(captainId, orderId, nextStatus) {
  const order = await Order.findById(orderId);
  if (!order) throw Object.assign(new Error('الطلب غير موجود'), { statusCode: 404 });
  if (String(order.captain) !== String(captainId)) {
    throw Object.assign(new Error('هذا الطلب غير مُسنَد إليك'), { statusCode: 403 });
  }

  const allowed = ALLOWED_TRANSITIONS[order.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw Object.assign(
      new Error(`انتقال غير مسموح: ${order.status} -> ${nextStatus}`),
      { statusCode: 400 }
    );
  }

  const from = order.status;
  order.status = nextStatus;

  // ختم الطابع الزمني للمرحلة المناسبة
  if (nextStatus === ORDER_STATUS.ACCEPTED) order.timeline.acceptedAt = new Date();
  if (nextStatus === ORDER_STATUS.PICKED_UP) order.timeline.pickedUpAt = new Date();
  if (nextStatus === ORDER_STATUS.DELIVERED) order.timeline.deliveredAt = new Date();
  await order.save();

  // عند التسليم: حرّر الكابتن ليصبح متاحًا مجددًا
  if (nextStatus === ORDER_STATUS.DELIVERED) {
    await Captain.findByIdAndUpdate(captainId, {
      status: CAPTAIN_STATUS.ONLINE,
      activeOrder: null,
    });
  }

  await writeLog({
    order: order._id,
    actorId: captainId,
    actorRole: 'captain',
    action: 'STATUS_CHANGED',
    fromStatus: from,
    toStatus: nextStatus,
  });

  // بثّ التحديث لكل الأطراف المتابعين للطلب
  const io_ = io.get();
  io_.to(ROOMS.user(order.user.toString())).emit(EVENTS.ORDER_STATUS_UPDATED, order);
  io_.to(ROOMS.admins()).emit(EVENTS.ORDER_STATUS_UPDATED, order);
  io_.to(ROOMS.order(order._id.toString())).emit(EVENTS.ORDER_STATUS_UPDATED, order);

  return order;
}

// جلب الطلبات النشطة (للوحة الأدمن)
async function getActiveOrders() {
  return Order.find({
    status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.ASSIGNED, ORDER_STATUS.ACCEPTED, ORDER_STATUS.PICKED_UP] },
  })
    .populate('user', 'name phone')
    .populate('captain', 'name phone status')
    .sort({ createdAt: -1 });
}

// جلب الكباتن المتاحين (online) — لقائمة الإسناد في لوحة الأدمن
async function getAvailableCaptains() {
  return Captain.find({ status: CAPTAIN_STATUS.ONLINE, isApproved: true }).select(
    'name phone vehicleType currentLocation rating'
  );
}

// جلب طلب واحد للتتبّع — مع التحقّق من صلاحية الوصول (صاحب الطلب/الكابتن المُسنَد/الأدمن)
async function getOrderForTracking(orderId, requesterId, requesterRole) {
  const order = await Order.findById(orderId)
    .populate('captain', 'name phone vehicleType currentLocation status')
    .populate('user', 'name phone');
  if (!order) throw Object.assign(new Error('الطلب غير موجود'), { statusCode: 404 });

  const isOwner = String(order.user?._id || order.user) === String(requesterId);
  const isAssignedCaptain = String(order.captain?._id || order.captain) === String(requesterId);
  const isAdmin = requesterRole === 'admin';
  if (!isOwner && !isAssignedCaptain && !isAdmin) {
    throw Object.assign(new Error('غير مصرّح بعرض هذا الطلب'), { statusCode: 403 });
  }
  return order;
}

module.exports = {
  createOrder,
  assignOrder,
  updateOrderStatus,
  getActiveOrders,
  getAvailableCaptains,
  getOrderForTracking,
};
