'use strict';

const Order = require('../models/Order');
const Captain = require('../models/Captain');
const Log = require('../models/Log');
const io = require('../sockets/io');
const env = require('../config/env');
const logger = require('../utils/logger');
const pricing = require('./pricing.service');
const { addRating } = require('../utils/rating');
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
  // نحسب المسافة والسعر في الخادم (مصدر الحقيقة) بدل الثقة بقيم العميل.
  const { distanceKm, price } = pricing.quote(
    payload.pickup.location.coordinates,
    payload.dropoff.location.coordinates,
    payload.vehicleType
  );

  const order = await Order.create({
    user: userId,
    pickup: payload.pickup,
    dropoff: payload.dropoff,
    packageNote: payload.packageNote,
    price,
    distanceKm,
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

  // إسناد تلقائي لأقرب كابتن عند التفعيل (AUTO_ASSIGN=true).
  // إن لم يوجد كابتن يبقى الطلب pending للإسناد اليدوي — دون كسر تدفّق الإنشاء.
  if (env.autoAssign) {
    try {
      const result = await autoAssignOrder(order._id, { actorRole: 'system' });
      if (result.assigned) return result.order;
    } catch (err) {
      logger.warn('فشل الإسناد التلقائي، يبقى الطلب للإسناد اليدوي:', err.message);
    }
  }

  return order;
}

/**
 * منطق الإسناد المشترك: يربط طلبًا (في حالة pending) بكابتن متاح،
 * يشغّل الكابتن، يكتب Log، ويبثّ الإشعارات. يُستخدم من الإسناد اليدوي
 * والتلقائي معًا لتفادي تكرار المنطق.
 */
async function commitAssignment(order, captain, { actorId, actorRole }) {
  const from = order.status;
  order.captain = captain._id;
  order.status = ORDER_STATUS.ASSIGNED;
  order.timeline.assignedAt = new Date();
  await order.save();

  // شغل الكابتن وربطه بالطلب النشط
  captain.status = CAPTAIN_STATUS.BUSY;
  captain.activeOrder = order._id;
  await captain.save();

  await writeLog({
    order: order._id,
    actorId,
    actorRole,
    action: 'ORDER_ASSIGNED',
    fromStatus: from,
    toStatus: ORDER_STATUS.ASSIGNED,
    meta: { captainId: captain._id, mode: actorRole === 'system' ? 'auto' : 'manual' },
  });

  const populated = await order.populate('captain', 'name phone vehicleType');

  // إشعارات لحظية: للكابتن (طلب جديد مُسنَد)، للمستخدم، وللأدمن
  io.get().to(ROOMS.captain(captain._id.toString())).emit(EVENTS.ORDER_ASSIGNED, populated);
  io.get().to(ROOMS.user(order.user.toString())).emit(EVENTS.ORDER_STATUS_UPDATED, populated);
  io.get().to(ROOMS.admins()).emit(EVENTS.ORDER_STATUS_UPDATED, populated);

  return populated;
}

// جلب طلب pending والتحقّق من صلاحيته للإسناد
async function loadAssignableOrder(orderId) {
  const order = await Order.findById(orderId);
  if (!order) throw Object.assign(new Error('الطلب غير موجود'), { statusCode: 404 });
  if (order.status !== ORDER_STATUS.PENDING) {
    throw Object.assign(new Error('لا يمكن إسناد طلب ليس في حالة الانتظار'), { statusCode: 400 });
  }
  return order;
}

/**
 * (2) الإسناد اليدوي من قِبل الأدمن: ربط طلب pending بكابتن محدّد.
 */
async function assignOrder(adminId, orderId, captainId) {
  const order = await loadAssignableOrder(orderId);

  const captain = await Captain.findById(captainId);
  if (!captain) throw Object.assign(new Error('الكابتن غير موجود'), { statusCode: 404 });
  if (captain.status !== CAPTAIN_STATUS.ONLINE) {
    throw Object.assign(new Error('الكابتن غير متاح حاليًا'), { statusCode: 400 });
  }

  return commitAssignment(order, captain, { actorId: adminId, actorRole: 'admin' });
}

/**
 * البحث عن أقرب كابتن متاح لنقطة معيّنة باستخدام فهرس 2dsphere.
 * @param {[number, number]} coordinates  إحداثيات [lng, lat] لنقطة الاستلام
 * @param {number} maxKm  أقصى نطاق بحث بالكيلومترات
 */
async function findNearestCaptain(coordinates, maxKm = 10) {
  return Captain.findOne({
    status: CAPTAIN_STATUS.ONLINE,
    isApproved: true,
    activeOrder: null,
    currentLocation: {
      $near: {
        $geometry: { type: 'Point', coordinates },
        $maxDistance: maxKm * 1000, // بالأمتار
      },
    },
  });
}

/**
 * الإسناد التلقائي: يجد أقرب كابتن متاح لنقطة الاستلام ويُسنده الطلب.
 * يُستدعى تلقائيًا عند إنشاء الطلب (إن فُعِّل) أو يدويًا من الأدمن.
 * @param {'system'|'admin'} actorRole  من أطلق الإسناد التلقائي
 */
async function autoAssignOrder(orderId, { actorId = null, actorRole = 'system' } = {}) {
  const order = await loadAssignableOrder(orderId);

  const pickupCoords = order.pickup.location.coordinates; // [lng, lat]
  const captain = await findNearestCaptain(pickupCoords);
  if (!captain) {
    // لا يوجد كابتن متاح الآن → يبقى الطلب pending للإسناد اليدوي لاحقًا
    return { assigned: false, order };
  }

  const populated = await commitAssignment(order, captain, { actorId, actorRole });
  return { assigned: true, order: populated };
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

// سجلّ طلبات المستخدم (كل الحالات) — مرتّبة من الأحدث، مع ترقيم بسيط
async function getMyOrders(userId, { limit = 20, skip = 0 } = {}) {
  return Order.find({ user: userId })
    .populate('captain', 'name phone vehicleType rating')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
}

/**
 * تقييم المستخدم للكابتن بعد تسليم الطلب.
 * الشروط: الطلب يخصّ المستخدم، حالته delivered، ولم يُقيَّم من قبل.
 */
async function rateOrder(userId, orderId, stars, comment = '') {
  const order = await Order.findById(orderId);
  if (!order) throw Object.assign(new Error('الطلب غير موجود'), { statusCode: 404 });
  if (String(order.user) !== String(userId)) {
    throw Object.assign(new Error('هذا الطلب لا يخصّك'), { statusCode: 403 });
  }
  if (order.status !== ORDER_STATUS.DELIVERED) {
    throw Object.assign(new Error('يمكن التقييم بعد التسليم فقط'), { statusCode: 400 });
  }
  if (order.rating?.stars) {
    throw Object.assign(new Error('تم تقييم هذا الطلب مسبقًا'), { statusCode: 400 });
  }

  // حفظ التقييم على الطلب
  order.rating = { stars, comment, ratedAt: new Date() };
  await order.save();

  // تحديث المتوسّط المتحرّك للكابتن
  const captain = await Captain.findById(order.captain);
  if (captain) {
    const { average, count } = addRating(captain.rating, captain.ratingsCount, stars);
    captain.rating = average;
    captain.ratingsCount = count;
    await captain.save();
  }

  await writeLog({
    order: order._id,
    actorId: userId,
    actorRole: 'user',
    action: 'ORDER_RATED',
    meta: { stars },
  });

  return order;
}

module.exports = {
  createOrder,
  assignOrder,
  autoAssignOrder,
  findNearestCaptain,
  updateOrderStatus,
  getActiveOrders,
  getAvailableCaptains,
  getOrderForTracking,
  getMyOrders,
  rateOrder,
};
