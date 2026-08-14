'use strict';

const Order = require('../models/Order');
const Captain = require('../models/Captain');
const Log = require('../models/Log');
const io = require('../sockets/io');
const env = require('../config/env');
const logger = require('../utils/logger');
const pricing = require('./pricing.service');
const notifications = require('./notification.service');
const chat = require('./chat.service');
const User = require('../models/User');
const { addRating } = require('../utils/rating');
const { canUserCancel, canCaptainReject } = require('../utils/orderRules');
const { summarizeEarnings } = require('../utils/earnings');
const { ratingDistribution } = require('../utils/reviews');
const { buildOrderFilter, parsePagination } = require('../utils/orderQuery');
const { computeSettlement, summarizeWallet } = require('../utils/wallet');
const { estimateEtaMinutes } = require('../utils/eta');
const { validateScheduledAt, isDue } = require('../utils/schedule');
const { normalizeIdempotencyKey } = require('../utils/idempotency');
const { normalizeLocation } = require('../utils/address');
const { generateDeliveryCode, verifyDeliveryCode } = require('../utils/deliveryCode');
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
async function createOrder(userId, payload, idempotencyKey) {
  // منع التكرار: إن وُصل نفس المفتاح سابقًا نُعيد الطلب الأصلي بدل إنشاء نسخة.
  const key = normalizeIdempotencyKey(idempotencyKey);
  if (key) {
    const existing = await Order.findOne({ user: userId, idempotencyKey: key });
    if (existing) return existing;
  }

  // تطبيع مواقع الاستلام/التسليم: نحفظ الحقول المُفصّلة (الحي/الشارع/التفاصيل/الملاحظة)
  // ونركّب عنوانًا موحّدًا `address` إن لم يُرسله العميل (Card 21).
  const pickup = normalizeLocation(payload.pickup);
  const dropoff = normalizeLocation(payload.dropoff);

  // نحسب المسافة والسعر والزمن في الخادم (مصدر الحقيقة) بدل الثقة بقيم العميل.
  const { distanceKm, price } = pricing.quote(
    pickup.location.coordinates,
    dropoff.location.coordinates,
    payload.vehicleType
  );
  const etaMinutes = estimateEtaMinutes(distanceKm, payload.vehicleType);

  // التحقّق من وقت الجدولة (اختياري)
  const scheduleError = validateScheduledAt(payload.scheduledAt);
  if (scheduleError) throw Object.assign(new Error(scheduleError), { statusCode: 400 });
  const scheduledAt = payload.scheduledAt ? new Date(payload.scheduledAt) : null;

  // رمز تسليم الطلب (Card 20) — يُعطى لصاحب الطلب لتأكيد الاستلام لاحقًا.
  const deliveryCode = generateDeliveryCode();

  let order;
  try {
    order = await Order.create({
      user: userId,
      pickup,
      dropoff,
      packageNote: payload.packageNote,
      etaMinutes,
      price,
      distanceKm,
      deliveryCode,
      scheduledAt,
      idempotencyKey: key || undefined,
      status: ORDER_STATUS.PENDING,
    });
  } catch (err) {
    // سباق: طلبان بنفس المفتاح في آنٍ واحد — نُعيد الأصلي عبر فهرس التفرّد
    if (err.code === 11000 && key) {
      return Order.findOne({ user: userId, idempotencyKey: key });
    }
    throw err;
  }

  await writeLog({
    order: order._id,
    actorId: userId,
    actorRole: 'user',
    action: 'ORDER_CREATED',
    toStatus: ORDER_STATUS.PENDING,
  });

  // إشعار صاحب الطلب برمز التسليم (Card 20): داخل التطبيق + Push (آمن بلا FCM).
  const codePayload = notifications.deliveryCodePayload(order, deliveryCode);
  notifications.createInApp(userId, 'user', codePayload);
  User.findById(userId)
    .select('deviceTokens')
    .then((u) => {
      if (u?.deviceTokens?.length) return notifications.sendToTokens(u.deviceTokens, codePayload);
    })
    .catch((e) => logger.warn('تعذّر إرسال رمز التسليم للمستخدم:', e.message));

  // نُحمّل بيانات صاحب الطلب لتظهر لوحة الأدمن اسمه فورًا (Card: اسم صاحب الطلب)
  await order.populate('user', 'name lastName phone');

  // بثّ لكل الأدمن: طلب جديد بانتظار الإسناد + إعلام المستخدم بغرفته
  io.get().to(ROOMS.admins()).emit(EVENTS.ORDER_CREATED, order);
  io.get().to(ROOMS.user(userId)).emit(EVENTS.ORDER_STATUS_UPDATED, order);

  // إسناد تلقائي لأقرب كابتن عند التفعيل (AUTO_ASSIGN=true) — للطلبات المستحقّة فقط.
  // الطلبات المجدولة مستقبلًا تبقى pending حتى يحين وقتها. إن لم يوجد كابتن يبقى
  // الطلب pending للإسناد اليدوي — دون كسر تدفّق الإنشاء.
  if (env.autoAssign && isDue(order.scheduledAt)) {
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
 * تفعيل الطلبات المجدولة التي حان وقتها (يستدعيه المُشغّل الخلفي دوريًا).
 * لكل طلب مستحقّ: يُعلَّم كمُفعّل، يُسجَّل، يُبثّ للأدمن كطلب جديد،
 * ويُسند تلقائيًا إن كان الإسناد التلقائي مفعّلًا.
 * @param {Date} now
 * @returns {Promise<number>} عدد الطلبات المُفعّلة
 */
async function activateDueScheduledOrders(now = new Date()) {
  const due = await Order.find({
    status: ORDER_STATUS.PENDING,
    scheduledActivated: false,
    scheduledAt: { $ne: null, $lte: now },
  });

  for (const order of due) {
    order.scheduledActivated = true;
    await order.save();

    await writeLog({
      order: order._id,
      actorRole: 'system',
      action: 'SCHEDULE_ACTIVATED',
      meta: { scheduledAt: order.scheduledAt },
    });

    // يظهر الآن كطلب جديد على لوحة الأدمن ويُعلَم المستخدم (باسم صاحب الطلب)
    const uid = order.user.toString();
    await order.populate('user', 'name lastName phone');
    io.get().to(ROOMS.admins()).emit(EVENTS.ORDER_CREATED, order);
    io.get().to(ROOMS.user(uid)).emit(EVENTS.ORDER_STATUS_UPDATED, order);

    if (env.autoAssign) {
      try {
        await autoAssignOrder(order._id, { actorRole: 'system' });
      } catch (err) {
        logger.warn('فشل الإسناد التلقائي لطلب مجدول:', err.message);
      }
    }
  }

  return due.length;
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

  // نُحمّل بيانات الكابتن وصاحب الطلب (الاسم الكامل + الهاتف) لتظهر فورًا في
  // شاشة الكابتن عبر حمولة الإسناد اللحظية (Card: تفاصيل صاحب الطلب في صفحة الكابتن)
  const populated = await order.populate([
    { path: 'captain', select: 'name phone vehicleType' },
    { path: 'user', select: 'name lastName phone' },
  ]);

  // إشعارات لحظية: للكابتن (طلب جديد مُسنَد)، للمستخدم، وللأدمن
  io.get().to(ROOMS.captain(captain._id.toString())).emit(EVENTS.ORDER_ASSIGNED, populated);
  io.get().to(ROOMS.user(order.user.toString())).emit(EVENTS.ORDER_STATUS_UPDATED, populated);
  io.get().to(ROOMS.admins()).emit(EVENTS.ORDER_STATUS_UPDATED, populated);

  // إشعار Push لإيقاظ الكابتن حتى والتطبيق مغلق (آمن: no-op إن كان FCM معطّلًا)
  const assignedPayload = notifications.orderAssignedPayload(order);
  notifications
    .sendToTokens(captain.deviceTokens, assignedPayload)
    .catch((e) => logger.warn('تعذّر إرسال إشعار الإسناد:', e.message));
  notifications.createInApp(captain._id, 'captain', assignedPayload); // إشعار داخلي

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
async function findNearestCaptain(coordinates, maxKm = 10, excludeIds = []) {
  const query = {
    status: CAPTAIN_STATUS.ONLINE,
    isApproved: true,
    activeOrder: null,
    currentLocation: {
      $near: {
        $geometry: { type: 'Point', coordinates },
        $maxDistance: maxKm * 1000, // بالأمتار
      },
    },
  };
  // استبعاد كباتن معيّنين (مثل من رفضوا الطلب) عند إعادة الإسناد
  if (excludeIds.length) query._id = { $nin: excludeIds };
  return Captain.findOne(query);
}

/**
 * الإسناد التلقائي: يجد أقرب كابتن متاح لنقطة الاستلام ويُسنده الطلب.
 * يُستدعى تلقائيًا عند إنشاء الطلب (إن فُعِّل) أو يدويًا من الأدمن.
 * @param {'system'|'admin'} actorRole  من أطلق الإسناد التلقائي
 */
async function autoAssignOrder(orderId, { actorId = null, actorRole = 'system' } = {}) {
  const order = await loadAssignableOrder(orderId);

  const pickupCoords = order.pickup.location.coordinates; // [lng, lat]
  // نستبعد الكباتن الذين رفضوا هذا الطلب سابقًا
  const captain = await findNearestCaptain(pickupCoords, 10, order.rejectedBy || []);
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

// تحرير الكابتن ليعود متاحًا (عند التسليم أو الإلغاء)
async function releaseCaptain(captainId) {
  if (!captainId) return;
  await Captain.findByIdAndUpdate(captainId, {
    status: CAPTAIN_STATUS.ONLINE,
    activeOrder: null,
  });
}

// بثّ تحديث حالة الطلب لكل الأطراف المتابعين له
function broadcastOrderUpdate(order) {
  const io_ = io.get();
  io_.to(ROOMS.user(order.user.toString())).emit(EVENTS.ORDER_STATUS_UPDATED, order);
  io_.to(ROOMS.admins()).emit(EVENTS.ORDER_STATUS_UPDATED, order);
  io_.to(ROOMS.order(order._id.toString())).emit(EVENTS.ORDER_STATUS_UPDATED, order);
  // الكابتن المُسنَد أيضًا — لتحديث شاشتَي الطلب والأرباح لحظيًا (تسليم/إلغاء)
  if (order.captain) {
    io_.to(ROOMS.captain(order.captain.toString())).emit(EVENTS.ORDER_STATUS_UPDATED, order);
  }
}

// إشعار Push لصاحب الطلب بتغيّر حالته (آمن: no-op إن كان FCM معطّلًا أو لا رموز)
async function pushOrderStatusToUser(order) {
  try {
    const payload = notifications.orderStatusPayload(order);
    notifications.createInApp(order.user, 'user', payload); // إشعار داخلي للمستخدم
    const user = await User.findById(order.user).select('deviceTokens');
    if (!user?.deviceTokens?.length) return;
    await notifications.sendToTokens(user.deviceTokens, payload);
  } catch (err) {
    logger.warn('تعذّر إرسال إشعار الحالة للمستخدم:', err.message);
  }
}

async function updateOrderStatus(captainId, orderId, nextStatus, reason = '', deliveryCode = '') {
  // نطلب رمز التسليم صراحةً (select:false) لأنّنا قد نحتاجه للتحقّق عند التسليم.
  const order = await Order.findById(orderId).select('+deliveryCode');
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

  // تأكيد التسليم برمز صاحب الطلب (Card 20): لا يُقبل "تم التسليم" إلا برمز صحيح.
  if (nextStatus === ORDER_STATUS.DELIVERED) {
    if (!verifyDeliveryCode(order.deliveryCode, deliveryCode)) {
      throw Object.assign(
        new Error('رمز التسليم غير صحيح — اطلبه من صاحب الطلب'),
        { statusCode: 400 }
      );
    }
  }

  const from = order.status;
  order.status = nextStatus;

  // ختم الطابع الزمني للمرحلة المناسبة
  if (nextStatus === ORDER_STATUS.ACCEPTED) order.timeline.acceptedAt = new Date();
  if (nextStatus === ORDER_STATUS.PICKED_UP) order.timeline.pickedUpAt = new Date();
  if (nextStatus === ORDER_STATUS.DELIVERED) {
    order.timeline.deliveredAt = new Date();
    // حساب التسوية المالية (COD): عمولة الشركة وصافي الكابتن
    const { commission, net } = computeSettlement(order.price, env.commissionRate);
    order.commission = commission;
    order.captainNet = net;
  }
  if (nextStatus === ORDER_STATUS.CANCELLED) {
    order.timeline.cancelledAt = new Date();
    order.cancelReason = reason || 'ألغاه الكابتن';
  }
  await order.save();

  // عند التسليم أو الإلغاء: حرّر الكابتن ليصبح متاحًا مجددًا + احذف رسائل الدردشة (Card 18)
  if (nextStatus === ORDER_STATUS.DELIVERED || nextStatus === ORDER_STATUS.CANCELLED) {
    await releaseCaptain(captainId);
    chat.purgeOrderMessages(order._id); // بلا انتظار — لا يعيق تدفّق الحالة
  }

  await writeLog({
    order: order._id,
    actorId: captainId,
    actorRole: 'captain',
    action: 'STATUS_CHANGED',
    fromStatus: from,
    toStatus: nextStatus,
    meta: nextStatus === ORDER_STATUS.CANCELLED ? { reason: order.cancelReason } : {},
  });

  broadcastOrderUpdate(order);
  pushOrderStatusToUser(order); // إشعار المستخدم بتغيّر الحالة (بلا انتظار)
  return order;
}

/**
 * منطق مشترك: إعادة طلب للمجمّع (pending)، استبعاد الكابتن المعنيّ،
 * تحريره، ثم إعادة الإسناد التلقائي لأقرب كابتن آخر. يُستخدم من الرفض اليدوي
 * ومن انتهاء مهلة القبول.
 */
async function returnToPoolAndReassign(order, captainId, { actorRole, action, reason = '' }) {
  const from = order.status;
  order.status = ORDER_STATUS.PENDING;
  order.captain = null;
  order.timeline.assignedAt = null;
  order.timeline.acceptedAt = null;
  if (reason) order.cancelReason = reason; // ملاحظة سبب الرفض (Card 24)
  if (captainId && !order.rejectedBy.map(String).includes(String(captainId))) {
    order.rejectedBy.push(captainId);
  }
  await order.save();

  await releaseCaptain(captainId);
  await writeLog({
    order: order._id,
    actorId: actorRole === 'system' ? null : captainId,
    actorRole,
    action,
    fromStatus: from,
    toStatus: ORDER_STATUS.PENDING,
    meta: reason ? { reason } : {},
  });

  // يعود للأدمن كطلب معلّق + إعلام المستخدم (باسم صاحب الطلب)
  const ownerId = order.user.toString();
  await order.populate('user', 'name lastName phone');
  io.get().to(ROOMS.admins()).emit(EVENTS.ORDER_CREATED, order);
  io.get().to(ROOMS.user(ownerId)).emit(EVENTS.ORDER_STATUS_UPDATED, order);

  // إعلام الكابتن السابق ليختفي الطلب من شاشته فورًا دون تحديث (Cards: رفض/انتقال لغير متصل).
  // في هذه اللحظة الطلب pending وبلا كابتن، فتعرف شاشة الكابتن أنه لم يعد مُسنَدًا إليها.
  if (captainId) {
    io.get().to(ROOMS.captain(String(captainId))).emit(EVENTS.ORDER_STATUS_UPDATED, order);
  }

  // إعادة إسناد تلقائي لأقرب كابتن آخر (مع استبعاد من رُفض/انتهت مهلته)
  if (env.autoAssign) {
    try {
      const result = await autoAssignOrder(order._id, { actorRole: 'system' });
      return result.order;
    } catch (err) {
      logger.warn('فشل إعادة الإسناد:', err.message);
    }
  }
  return order;
}

/**
 * رفض الكابتن للطلب (قبل الاستلام): يسجّل ملاحظة سبب الرفض، يعيد الطلب للمجمّع
 * ويُعاد إسناده لكابتن آخر، ثم يجعل الكابتن الرافض "غير متصل" (Card 24).
 * @param {string} captainId
 * @param {string} orderId
 * @param {string} reason  ملاحظة سبب الرفض (مطلوبة من واجهة الكابتن)
 */
async function rejectOrder(captainId, orderId, reason = '') {
  const order = await Order.findById(orderId);
  if (!order) throw Object.assign(new Error('الطلب غير موجود'), { statusCode: 404 });
  if (String(order.captain) !== String(captainId)) {
    throw Object.assign(new Error('هذا الطلب غير مُسنَد إليك'), { statusCode: 403 });
  }
  if (!canCaptainReject(order.status)) {
    throw Object.assign(new Error('لا يمكن رفض الطلب في حالته الحالية'), { statusCode: 400 });
  }

  const result = await returnToPoolAndReassign(order, captainId, {
    actorRole: 'captain',
    action: 'ORDER_REJECTED',
    reason: (reason || '').toString().trim(),
  });

  // بعد الرفض: الكابتن يصبح غير متصل (Card 24). نتجاوز إعادة تعيينه online
  // التي تمّت داخل returnToPoolAndReassign، ونُعلم الأدمن ليختفي من المتاحين.
  await Captain.findByIdAndUpdate(captainId, { status: CAPTAIN_STATUS.OFFLINE });
  io.get().to(ROOMS.admins()).emit(EVENTS.CAPTAIN_STATUS_CHANGED, {
    captainId,
    status: CAPTAIN_STATUS.OFFLINE,
  });

  return result;
}

/**
 * انتهاء مهلة القبول: يجد الطلبات المُسنَدة التي لم تُقبَل خلال المهلة
 * ويعيد إسنادها (كابتن لم يستجب يُستبعَد). يستدعيه المُشغّل الخلفي.
 * @param {Date} now
 * @returns {Promise<number>} عدد الطلبات المُعاد إسنادها
 */
async function expireStaleAssignments(now = new Date()) {
  const timeoutMs = env.acceptTimeoutSeconds * 1000;
  const cutoff = new Date(now.getTime() - timeoutMs);

  const stale = await Order.find({
    status: ORDER_STATUS.ASSIGNED,
    'timeline.assignedAt': { $ne: null, $lte: cutoff },
  });

  for (const order of stale) {
    await returnToPoolAndReassign(order, order.captain, {
      actorRole: 'system',
      action: 'ORDER_ASSIGN_TIMEOUT',
    });
  }
  return stale.length;
}

/**
 * إلغاء الطلب من قِبل المستخدم (صاحب الطلب) أو الأدمن.
 * يُسمح قبل الاستلام فقط (pending/assigned/accepted)، ويحرّر الكابتن إن وُجد.
 */
async function cancelOrder(orderId, { actorId, actorRole }, reason = '') {
  const order = await Order.findById(orderId);
  if (!order) throw Object.assign(new Error('الطلب غير موجود'), { statusCode: 404 });

  // التحقّق من الصلاحية: المالك أو الأدمن
  const isOwner = String(order.user) === String(actorId);
  if (!isOwner && actorRole !== 'admin') {
    throw Object.assign(new Error('غير مصرّح بإلغاء هذا الطلب'), { statusCode: 403 });
  }

  // التحقّق من قابلية الإلغاء حسب الحالة
  if (!canUserCancel(order.status)) {
    throw Object.assign(
      new Error('لا يمكن إلغاء الطلب في حالته الحالية'),
      { statusCode: 400 }
    );
  }

  const from = order.status;
  const captainId = order.captain;

  order.status = ORDER_STATUS.CANCELLED;
  order.timeline.cancelledAt = new Date();
  order.cancelReason = reason || (actorRole === 'admin' ? 'ألغاه الأدمن' : 'ألغاه المستخدم');
  await order.save();

  await releaseCaptain(captainId); // تحرير الكابتن إن كان مُسنَدًا
  chat.purgeOrderMessages(order._id); // حذف رسائل الدردشة بعد الإلغاء (Card 18)

  await writeLog({
    order: order._id,
    actorId,
    actorRole,
    action: 'ORDER_CANCELLED',
    fromStatus: from,
    toStatus: ORDER_STATUS.CANCELLED,
    meta: { reason: order.cancelReason },
  });

  // إشعار الكابتن (إن كان مُسنَدًا) بأن الطلب أُلغي + بقية الأطراف
  if (captainId) {
    io.get().to(ROOMS.captain(captainId.toString())).emit(EVENTS.ORDER_STATUS_UPDATED, order);
    const cancelPayload = notifications.orderCancelledPayload(order);
    notifications.createInApp(captainId, 'captain', cancelPayload); // إشعار داخلي
    // إشعار Push للكابتن بإلغاء الطلب
    Captain.findById(captainId)
      .select('deviceTokens')
      .then((cap) => {
        if (cap?.deviceTokens?.length) {
          return notifications.sendToTokens(cap.deviceTokens, cancelPayload);
        }
      })
      .catch((e) => logger.warn('تعذّر إرسال إشعار الإلغاء للكابتن:', e.message));
  }
  broadcastOrderUpdate(order);

  return order;
}

// جلب الطلبات النشطة (للوحة الأدمن)
async function getActiveOrders() {
  return Order.find({
    status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.ASSIGNED, ORDER_STATUS.ACCEPTED, ORDER_STATUS.PICKED_UP] },
  })
    .populate('user', 'name lastName phone')
    .populate('captain', 'name phone status')
    .sort({ createdAt: -1 });
}

// بحث/فلترة الطلبات مع ترقيم (للوحة الأدمن) — يعيد العناصر والإجمالي وعدد الصفحات
async function listOrders(rawQuery = {}) {
  const filter = buildOrderFilter(rawQuery);
  const { page, limit, skip } = parsePagination(rawQuery);

  // نُشغّل جلب الصفحة والعدّ الكلّي بالتوازي
  const [items, total] = await Promise.all([
    Order.find(filter)
      .populate('user', 'name phone')
      .populate('captain', 'name phone status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Order.countDocuments(filter),
  ]);

  return { items, total, page, pages: Math.ceil(total / limit) || 1 };
}

// تجهيز صفوف الطلبات للتصدير CSV (بنفس مرشّحات البحث، بحدّ أعلى للأمان)
async function getOrdersForExport(rawQuery = {}) {
  const filter = buildOrderFilter(rawQuery);
  const MAX_EXPORT = 5000; // حدّ يمنع تصدير ضخم يستنزف الذاكرة

  const orders = await Order.find(filter)
    .populate('user', 'name lastName phone')
    .populate('captain', 'name phone')
    .sort({ createdAt: -1 })
    .limit(MAX_EXPORT)
    .lean();

  // تسطيح كل طلب إلى صفّ مسطّح مناسب للـ CSV
  return orders.map((o) => ({
    id: String(o._id),
    status: o.status,
    createdAt: o.createdAt ? new Date(o.createdAt).toISOString() : '',
    deliveredAt: o.timeline?.deliveredAt ? new Date(o.timeline.deliveredAt).toISOString() : '',
    userName: [o.user?.name, o.user?.lastName].filter(Boolean).join(' ') || '',
    userPhone: o.user?.phone || '',
    captainName: o.captain?.name || '',
    pickup: o.pickup?.address || '',
    dropoff: o.dropoff?.address || '',
    distanceKm: o.distanceKm ?? '',
    price: o.price ?? '',
  }));
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

// سجلّ طلبات الكابتن (المُسنَدة إليه) — مرتّبة من الأحدث.
// نُحمّل الاسم الكامل (name + lastName) والهاتف لعرض تفاصيل صاحب الطلب في شاشة الكابتن.
async function getCaptainOrders(captainId, { limit = 20, skip = 0 } = {}) {
  return Order.find({ captain: captainId })
    .populate('user', 'name lastName phone')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
}

/**
 * تحويل الكابتن إلى "غير متصل" (offline) — يُستدعى من REST ومن السوكت.
 * إن كان لديه طلب نشط لم يُستَلم بعد (assigned/accepted) يُرفَض الطلب فورًا،
 * يُعاد إلى مجمّع الأدمن لإسناده لكابتن آخر، ويختفي من شاشة الكابتن لحظيًا (Card 16).
 * الطلبات التي بعد الاستلام (picked_up) لا تُمَسّ.
 */
async function setCaptainOffline(captainId) {
  const captain = await Captain.findById(captainId);
  if (!captain) throw Object.assign(new Error('الكابتن غير موجود'), { statusCode: 404 });

  let clearedActive = false;
  if (captain.activeOrder) {
    const activeOrder = await Order.findById(captain.activeOrder);
    const prePickup =
      activeOrder &&
      [ORDER_STATUS.ASSIGNED, ORDER_STATUS.ACCEPTED].includes(activeOrder.status);
    if (prePickup) {
      // يعيده للمجمّع (يحرّر الكابتن + يبثّ للكابتن ليختفي + يعيد الإسناد لآخر)
      await returnToPoolAndReassign(activeOrder, captainId, {
        actorRole: 'captain',
        action: 'ORDER_REJECTED_CAPTAIN_OFFLINE',
      });
      clearedActive = true;
    }
  }

  // نضبط الكابتن غير متصل (نتجاوز أي إعادة تعيين online من returnToPoolAndReassign)
  const update = { status: CAPTAIN_STATUS.OFFLINE };
  if (clearedActive) update.activeOrder = null;
  const updated = await Captain.findByIdAndUpdate(captainId, update, { new: true }).select(
    'name status'
  );

  // إعلام الأدمن ليختفي الكابتن من قائمة المتاحين فورًا (Card 15)
  io.get().to(ROOMS.admins()).emit(EVENTS.CAPTAIN_STATUS_CHANGED, {
    captainId: updated._id,
    status: updated.status,
  });
  return updated;
}

// مراجعات الكابتن: أحدث التعليقات + توزيع النجوم + المتوسّط والعدد
async function getCaptainReviews(captainId, { limit = 20 } = {}) {
  const [captain, ratedOrders] = await Promise.all([
    Captain.findById(captainId).select('name rating ratingsCount'),
    Order.find({ captain: captainId, 'rating.stars': { $exists: true } })
      .select('rating createdAt')
      .sort({ 'rating.ratedAt': -1 })
      .limit(limit)
      .lean(),
  ]);

  if (!captain) throw Object.assign(new Error('الكابتن غير موجود'), { statusCode: 404 });

  const reviews = ratedOrders.map((o) => ({
    stars: o.rating.stars,
    comment: o.rating.comment || '',
    ratedAt: o.rating.ratedAt,
  }));

  return {
    captain: { id: captain._id, name: captain.name },
    average: captain.rating,
    count: captain.ratingsCount,
    distribution: ratingDistribution(reviews),
    reviews,
  };
}

// محفظة الكابتن (COD): إجمالي التحصيل، العمولة، الصافي، والمستحقّ للشركة
async function getCaptainWallet(captainId) {
  const [captain, delivered] = await Promise.all([
    Captain.findById(captainId).select('name settledCommission'),
    Order.find({ captain: captainId, status: ORDER_STATUS.DELIVERED })
      .select('price commission captainNet')
      .lean(),
  ]);
  if (!captain) throw Object.assign(new Error('الكابتن غير موجود'), { statusCode: 404 });

  const summary = summarizeWallet(delivered, captain.settledCommission);
  return { captain: { id: captain._id, name: captain.name }, ...summary, settled: captain.settledCommission };
}

// تسوية عمولة كابتن من قِبل الأدمن (يزيد settledCommission دون تجاوز الإجمالي)
async function settleCaptain(captainId, amount) {
  const value = Number(amount);
  if (!value || value <= 0) {
    throw Object.assign(new Error('مبلغ التسوية غير صالح'), { statusCode: 400 });
  }

  const wallet = await getCaptainWallet(captainId);
  if (value > wallet.owed) {
    throw Object.assign(
      new Error(`المبلغ يتجاوز المستحقّ (${wallet.owed})`),
      { statusCode: 400 }
    );
  }

  const captain = await Captain.findByIdAndUpdate(
    captainId,
    { $inc: { settledCommission: value } },
    { new: true }
  ).select('name settledCommission');

  await writeLog({
    actorId: captainId,
    actorRole: 'admin',
    action: 'COMMISSION_SETTLED',
    meta: { amount: value },
  });

  return { captainId: captain._id, settled: captain.settledCommission };
}

// ملخّص أرباح الكابتن من طلباته المسلّمة (إجمالي/اليوم/الأسبوع)
async function getCaptainEarnings(captainId) {
  const delivered = await Order.find({
    captain: captainId,
    status: ORDER_STATUS.DELIVERED,
  })
    .select('price timeline.deliveredAt')
    .lean();

  return summarizeEarnings(
    delivered.map((o) => ({ price: o.price, deliveredAt: o.timeline?.deliveredAt }))
  );
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
  activateDueScheduledOrders,
  assignOrder,
  autoAssignOrder,
  findNearestCaptain,
  updateOrderStatus,
  rejectOrder,
  expireStaleAssignments,
  cancelOrder,
  getActiveOrders,
  listOrders,
  getOrdersForExport,
  getAvailableCaptains,
  getOrderForTracking,
  getMyOrders,
  getCaptainOrders,
  setCaptainOffline,
  getCaptainEarnings,
  getCaptainReviews,
  getCaptainWallet,
  settleCaptain,
  rateOrder,
};
