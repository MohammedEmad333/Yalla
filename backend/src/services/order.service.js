'use strict';

const crypto = require('crypto');
const Order = require('../models/Order');
const Captain = require('../models/Captain');
const Log = require('../models/Log');
const io = require('../sockets/io');
const env = require('../config/env');
const logger = require('../utils/logger');
const pricing = require('./pricing.service');
const notifications = require('./notification.service');
const settingsService = require('./settings.service');
const chat = require('./chat.service');
const walletService = require('./wallet.service');
const captainWallet = require('./captainWallet.service');
const adminService = require('./admin.service');
const { coordsForNeighborhood } = require('../utils/neighborhoods');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const { addRating } = require('../utils/rating');
const { canUserCancel, canCaptainReject } = require('../utils/orderRules');
const { summarizeEarnings } = require('../utils/earnings');
const { ratingDistribution } = require('../utils/reviews');
const { buildOrderFilter, parsePagination } = require('../utils/orderQuery');
const { summarizeWallet } = require('../utils/wallet');
const { estimateEtaMinutes, isOrderDelayed, deliveryDueAt } = require('../utils/eta');
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

// نسبة الكابتن من السعر الحقيقي (Card 27): ٨٠٪ للكابتن، والباقي عمولة الشركة.
const CAPTAIN_SHARE = 0.8;

// Card 95: الحالات التي تُعدّ فيها الطلبات "نشطة" على الكابتن (تشغله). يُعاد
// احتساب حمل الكابتن منها لضمان تطابق العدّاد مع الواقع دون انحراف.
const ACTIVE_ORDER_STATUSES = [
  ORDER_STATUS.ASSIGNED,
  ORDER_STATUS.ACCEPTED,
  ORDER_STATUS.PICKED_UP,
];

// Card 95: الحدّ الأقصى للطلبات المتزامنة لكابتن واحد عند الإسناد اليدوي من
// لوحة التحكم. قابل للضبط عبر البيئة (MAX_ORDERS_PER_CAPTAIN)، افتراضيًا 5.
const MAX_ACTIVE_ORDERS_PER_CAPTAIN =
  parseInt(process.env.MAX_ORDERS_PER_CAPTAIN, 10) > 0
    ? parseInt(process.env.MAX_ORDERS_PER_CAPTAIN, 10)
    : 5;

/**
 * Card 95: إعادة احتساب حمل الكابتن من مصدر الحقيقة (مجموعة الطلبات) وتحديث
 * حالته وعدّاده والطلب النشط المرجعي. يُستخدم بعد التسليم/الإلغاء/إعادة الطلب
 * للمجمّع فيبقى العدّاد متطابقًا حتى مع تعدّد الطلبات.
 * لا يلمس حالة OFFLINE (يتكفّل بها setCaptainOffline صراحةً بعد النداء).
 * @param {string|import('mongoose').Types.ObjectId} captainId
 * @returns {Promise<{ activeOrdersCount: number, activeOrder: any, status: string }|null>}
 */
async function syncCaptainWorkload(captainId) {
  if (!captainId) return null;
  const active = await Order.find({
    captain: captainId,
    status: { $in: ACTIVE_ORDER_STATUSES },
  })
    .select('_id')
    .sort({ createdAt: -1 })
    .lean();

  const count = active.length;
  const captain = await Captain.findById(captainId).select('status');
  // نحافظ على OFFLINE إن كان الكابتن غير متصل؛ خلاف ذلك BUSY عند وجود طلب، وإلا ONLINE.
  const nextStatus =
    captain && captain.status === CAPTAIN_STATUS.OFFLINE
      ? CAPTAIN_STATUS.OFFLINE
      : count > 0
        ? CAPTAIN_STATUS.BUSY
        : CAPTAIN_STATUS.ONLINE;

  const update = {
    activeOrdersCount: count,
    activeOrder: count > 0 ? active[0]._id : null,
    status: nextStatus,
  };
  await Captain.findByIdAndUpdate(captainId, update);
  return update;
}

/**
 * السعر الفعلي المُعتمَد في السجلّات والأرباح (Card 28).
 * بعد التسليم يعتمد المبلغ على السعر الحقيقي الذي أدخله الكابتن (finalPrice)
 * وليس السعر التقريبي (price). نعود للسعر التقريبي فقط للطلبات القديمة التي
 * سُلّمت قبل إضافة finalPrice (finalPrice = 0). هكذا لا يظهر «12» بينما الحقيقي «10».
 * @param {{price?:number, finalPrice?:number}} order
 * @returns {number}
 */
function effectivePrice(order) {
  const final = Number(order?.finalPrice) || 0;
  return final > 0 ? final : Number(order?.price) || 0;
}

function httpError(message, statusCode = 400) {
  return Object.assign(new Error(message), { statusCode });
}

// تسجيل حدث في سجل الأحداث
async function writeLog({ order, actorId, actorRole, action, fromStatus, toStatus, meta }) {
  await Log.create({ order, actorId, actorRole, action, fromStatus, toStatus, meta });
}

/**
 * ضمان وجود إحداثيّات صالحة لموقع الطلب (Card 27): إن لم يُرسل العميل إحداثيّات
 * (أو كانت صفريّة) نشتقّها من اسم الحي المختار من أحياء غزة. يبقى الموقع كما هو
 * إن كانت إحداثيّاته صالحة مسبقًا (توافق مع الطلبات القديمة).
 * @param {object} loc موقع مُطبّع (يحوي neighborhood و location.coordinates)
 */
function ensureCoordsFromNeighborhood(loc) {
  const coords = loc?.location?.coordinates;
  const hasValid =
    Array.isArray(coords) && coords.length === 2 && (coords[0] !== 0 || coords[1] !== 0);
  if (hasValid) return loc;

  const fromHood = coordsForNeighborhood(loc?.neighborhood);
  if (!fromHood) {
    throw httpError('اختر حيًّا صالحًا من أحياء غزة لنقطتَي الاستلام والتسليم', 400);
  }
  return { ...loc, location: { type: 'Point', coordinates: fromHood } };
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
  // ثم نشتقّ الإحداثيّات من الحي المختار إن لم تُرسَل (Card 27).
  const pickup = ensureCoordsFromNeighborhood(normalizeLocation(payload.pickup));
  const dropoff = ensureCoordsFromNeighborhood(normalizeLocation(payload.dropoff));

  // نحسب المسافة والسعر التقريبي والزمن في الخادم (مصدر الحقيقة) بدل الثقة بقيم العميل.
  const { distanceKm, price } = pricing.quote(
    pickup.location.coordinates,
    dropoff.location.coordinates,
    payload.vehicleType
  );
  const etaMinutes = estimateEtaMinutes(distanceKm, payload.vehicleType);

  // Card 27: يجب أن يغطّي رصيد محفظة المستخدم السعر التقريبي قبل إنشاء الطلب.
  const { balance } = await walletService.getWalletSummary(userId);
  if (balance < price) {
    throw httpError(
      `رصيد محفظتك (${balance} ₪) لا يكفي للسعر التقريبي (${price} ₪) — اشحن محفظتك أولًا`,
      400
    );
  }

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
  // Card 103: إشعار Push لأجهزة الأدمن (نسخة أندرويد) بطلب جديد — غير حاجب
  notifications.notifyAdmins(notifications.newOrderAdminPayload(order)).catch(() => {});

  // الإسناد التلقائي (بثّ لكل الكباتن): عند تفعيله من لوحة الأدمن يُبثّ الطلب لكل
  // الكباتن (مع إشعار Push) ليأخذه أوّل من يقبل — للطلبات المستحقّة فقط.
  if (settingsService.isBroadcastMode() && isDue(order.scheduledAt)) {
    try {
      return await broadcastOrderToCaptains(order);
    } catch (err) {
      logger.warn('فشل بثّ الطلب للكباتن، يبقى للإسناد اليدوي:', err.message);
    }
  }

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
 * إيجاد أو إنشاء زبون بالهاتف (Card 68) — يُستخدم عند إنشاء الأدمن لطلب نيابةً
 * عن صاحب طلب قد لا يملك حسابًا. نبحث بالهاتف؛ إن لم يوجد ننشئ حسابًا خفيفًا
 * بكلمة مرور عشوائية (لا تُستخدم للدخول) بدور "زبون".
 * @param {string} name  اسم صاحب الطلب
 * @param {string} phone رقم جواله
 * @param {{external?:boolean}} opts  Card 80: علِّم الحساب المُنشأ حديثًا كخارجي مؤقّت
 * @returns {Promise<import('mongoose').Document>}
 */
async function findOrCreateCustomerByPhone(name, phone, { external = false } = {}) {
  const cleanPhone = String(phone || '').trim();
  const cleanName = String(name || '').trim();
  const existing = await User.findOne({ phone: cleanPhone });
  // Card 80: إن كان لصاحب الهاتف حساب مسبق (دائم أو خارجي) نعيد استخدامه دون
  // تغيير صفته — لا نحوّل حسابًا دائمًا إلى خارجي.
  if (existing) return existing;

  const user = new User({
    name: cleanName || 'زبون',
    phone: cleanPhone,
    role: 'user',
    isExternal: external, // Card 80: حساب خارجي مؤقّت يُحذف بعد انتهاء طلبه
  });
  await user.setPassword(crypto.randomBytes(12).toString('hex')); // كلمة مرور عشوائية
  try {
    await user.save();
  } catch (err) {
    // سباق: أُنشئ الحساب بنفس الهاتف بالتزامن — نُعيد الموجود
    if (err.code === 11000) return User.findOne({ phone: cleanPhone });
    throw err;
  }
  return user;
}

/**
 * (1-ب) إنشاء طلب من لوحة الأدمن نيابةً عن صاحب الطلب (Card 68).
 * يأخذ اسم صاحب الطلب ورقم جواله وتفاصيل نقطتَي الاستلام والتسليم، ويُنشئ الطلب
 * في حالة pending ليظهر في لوحة الإسناد كبقية الطلبات — دون اشتراط رصيد محفظة
 * (يُسوّى نقدًا/خارجيًّا)، وبنفس منطق التسعير والإحداثيّات ورمز التسليم.
 * @param {string} adminId معرّف الأدمن المُنشئ
 * @param {object} payload {contactName, contactPhone, pickup, dropoff, packageNote?, vehicleType?, scheduledAt?}
 */
async function createOrderByAdmin(adminId, payload = {}) {
  const contactName = String(payload.contactName || '').trim();
  const contactPhone = String(payload.contactPhone || '').trim();
  if (!contactName) throw httpError('اسم صاحب الطلب مطلوب', 400);
  if (!contactPhone) throw httpError('رقم جوال صاحب الطلب مطلوب', 400);

  // نقطتا الاستلام والتسليم: تطبيع + اشتقاق إحداثيّات من الحي عند غيابها
  const pickup = ensureCoordsFromNeighborhood(normalizeLocation(payload.pickup));
  const dropoff = ensureCoordsFromNeighborhood(normalizeLocation(payload.dropoff));

  // نحفظ اسم/هاتف صاحب الطلب على نقطة الاستلام كجهة اتصال إن لم يحدّدها الأدمن
  if (!pickup.contactName) pickup.contactName = contactName;
  if (!pickup.contactPhone) pickup.contactPhone = contactPhone;

  // التسعير والزمن التقديري في الخادم (مصدر الحقيقة)
  const { distanceKm, price } = pricing.quote(
    pickup.location.coordinates,
    dropoff.location.coordinates,
    payload.vehicleType
  );
  const etaMinutes = estimateEtaMinutes(distanceKm, payload.vehicleType);

  // التحقّق من وقت الجدولة (اختياري)
  const scheduleError = validateScheduledAt(payload.scheduledAt);
  if (scheduleError) throw httpError(scheduleError, 400);
  const scheduledAt = payload.scheduledAt ? new Date(payload.scheduledAt) : null;

  // إيجاد/إنشاء صاحب الطلب بالهاتف ليرتبط الطلب بحساب زبون (Order.user مطلوب).
  // Card 80: الحساب المُنشأ حديثًا لطلب خارجي يُعلَّم كمؤقّت ليُحذف بعد انتهاء الطلب.
  const customer = await findOrCreateCustomerByPhone(contactName, contactPhone, { external: true });

  const deliveryCode = generateDeliveryCode();

  const order = await Order.create({
    user: customer._id,
    pickup,
    dropoff,
    packageNote: payload.packageNote,
    etaMinutes,
    price,
    distanceKm,
    deliveryCode,
    scheduledAt,
    status: ORDER_STATUS.PENDING,
  });

  await writeLog({
    order: order._id,
    actorId: adminId,
    actorRole: 'admin',
    action: 'ORDER_CREATED_BY_ADMIN',
    toStatus: ORDER_STATUS.PENDING,
    meta: { contactName, contactPhone },
  });

  // إشعار صاحب الطلب برمز التسليم (داخل التطبيق + Push إن كان له جهاز)
  const codePayload = notifications.deliveryCodePayload(order, deliveryCode);
  notifications.createInApp(customer._id, 'user', codePayload);
  if (customer.deviceTokens?.length) {
    notifications
      .sendToTokens(customer.deviceTokens, codePayload)
      .catch((e) => logger.warn('تعذّر إرسال رمز التسليم لصاحب الطلب:', e.message));
  }

  // Card 81: تنبيه الأدمن لإضافة رصيد كافٍ للحساب الخارجي إن كان جديدًا (مؤقّتًا)،
  // كي يكفي رصيده لدفع قيمة الطلب عند التسليم.
  if (customer.isExternal) {
    notifications.createInApp(adminId, 'admin', {
      title: '💳 طلب خارجي — أضف رصيدًا',
      body: `الطلب لحساب خارجي (${contactName}). أضف رصيدًا لا يقلّ عن ${price} ₪ لحسابه ليكفي لدفع الطلب.`,
      data: { type: 'EXTERNAL_ORDER_TOPUP', userId: String(customer._id), suggested: price },
    });
  }

  // بثّ للأدمن ليظهر الطلب فورًا في لوحة الإسناد (كبقية الطلبات)
  await order.populate('user', 'name lastName phone isExternal');
  io.get().to(ROOMS.admins()).emit(EVENTS.ORDER_CREATED, order);
  io.get().to(ROOMS.user(customer._id.toString())).emit(EVENTS.ORDER_STATUS_UPDATED, order);

  // الإسناد التلقائي (بثّ لكل الكباتن) عند تفعيله — للطلبات المستحقّة فقط
  if (settingsService.isBroadcastMode() && isDue(order.scheduledAt)) {
    try {
      return await broadcastOrderToCaptains(order);
    } catch (err) {
      logger.warn('فشل بثّ طلب الأدمن للكباتن، يبقى للإسناد اليدوي:', err.message);
    }
  }

  // إسناد تلقائي لأقرب كابتن عند التفعيل وللطلبات المستحقّة فقط
  if (env.autoAssign && isDue(order.scheduledAt)) {
    try {
      const result = await autoAssignOrder(order._id, { actorId: adminId, actorRole: 'admin' });
      if (result.assigned) return result.order;
    } catch (err) {
      logger.warn('فشل الإسناد التلقائي لطلب الأدمن، يبقى للإسناد اليدوي:', err.message);
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
    // Card 103: إشعار Push لأجهزة الأدمن بطلب مجدول أصبح فعّالًا الآن
    notifications.notifyAdmins(notifications.newOrderAdminPayload(order)).catch(() => {});

    if (settingsService.isBroadcastMode()) {
      try {
        await broadcastOrderToCaptains(order);
        continue;
      } catch (err) {
        logger.warn('فشل بثّ طلب مجدول للكباتن:', err.message);
      }
    }

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
  const wasBroadcast = order.broadcast;
  order.captain = captain._id;
  order.status = ORDER_STATUS.ASSIGNED;
  order.timeline.assignedAt = new Date();
  // إن كان الطلب مبثوثًا لكل الكباتن نُلغي البثّ الآن (أُسنِد لكابتن محدّد)
  order.broadcast = false;
  order.broadcastAt = null;
  await order.save();

  // أخبر بقيّة الكباتن أنّ الطلب أُخِذ ليختفي من شاشاتهم فورًا (بثّ سابق)
  if (wasBroadcast) emitOrderTaken(order._id, captain._id);

  // شغل الكابتن وربطه بالطلب النشط. Card 95: نُعيد احتساب عدّاد الطلبات النشطة
  // من قاعدة البيانات (الطلب الحالي محفوظ بحالة assigned) ليدعم إسناد أكثر من
  // طلب لنفس الكابتن دون انحراف العدّاد، ويشير activeOrder لأحدث طلب مُسنَد.
  const activeCount = await Order.countDocuments({
    captain: captain._id,
    status: { $in: ACTIVE_ORDER_STATUSES },
  });
  captain.status = CAPTAIN_STATUS.BUSY;
  captain.activeOrder = order._id;
  captain.activeOrdersCount = activeCount;
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
  // Card 52: الطلب المجدول لوقت لاحق لا يُسنَد قبل حلول وقته — يبقى مجدولًا حتى
  // يفعّله المُشغّل الخلفي (scheduledActivated) أو يحين وقته فعليًا.
  if (order.scheduledAt && !order.scheduledActivated && !isDue(order.scheduledAt)) {
    throw Object.assign(
      new Error('هذا الطلب مجدول لوقت لاحق — لا يمكن إسناده قبل حلول موعده'),
      { statusCode: 400 }
    );
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
  if (!captain.isApproved) {
    throw Object.assign(new Error('الكابتن غير معتمَد'), { statusCode: 400 });
  }
  // Card 34: يستطيع الأدمن الإسناد لكابتن غير متصل (offline) لإيقاظه عبر الإشعار.
  // Card 95: يُسمح الآن بإسناد أكثر من طلب لنفس الكابتن، حتى بلوغ الحدّ الأقصى
  // للطلبات المتزامنة. نحمي من التجاوز حتى لا يُحمَّل الكابتن فوق طاقته. نحسب
  // العدد الفعلي من قاعدة البيانات لتفادي أي انحراف في الحقل المخزَّن.
  const currentActive = await Order.countDocuments({
    captain: captain._id,
    status: { $in: ACTIVE_ORDER_STATUSES },
  });
  if (currentActive >= MAX_ACTIVE_ORDERS_PER_CAPTAIN) {
    throw Object.assign(
      new Error(
        `الكابتن وصل الحدّ الأقصى للطلبات المتزامنة (${MAX_ACTIVE_ORDERS_PER_CAPTAIN})`
      ),
      { statusCode: 400 }
    );
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

// ── الإسناد التلقائي: بثّ الطلب لكل الكباتن ومنافسة القبول (First-Come) ────────
//
// عند تفعيل الأدمن لـ«الإسناد التلقائي» من لوحة التحكم يُبثّ كل طلب جديد لكل
// الكباتن (لحظيًا + إشعار Push يُوقظهم حتى والهاتف مغلق). يراه الجميع ويأخذه أوّل
// من يقبل (قبول ذرّي عبر findOneAndUpdate)، ثم يختفي من شاشات الباقين.

// إخطار غرفة كل الكباتن بأنّ طلبًا مبثوثًا قد أُخِذ ليُزال من شاشاتهم فورًا
function emitOrderTaken(orderId, captainId = null) {
  try {
    io.get().to(ROOMS.captains()).emit(EVENTS.ORDER_TAKEN, {
      orderId: String(orderId),
      captainId: captainId ? String(captainId) : null,
    });
  } catch (_) {
    // السوكت غير مهيّأ (اختبارات) — نتجاهل بأمان
  }
}

/**
 * بثّ طلب (في حالة pending) لكل الكباتن المعتمَدين: يعلّمه كـ«مبثوث»، يبثّه لحظيًا
 * لغرفة الكباتن، ويرسل إشعار Push لأجهزتهم (آمن: no-op إن كان FCM معطّلًا) حتى
 * يصلهم حتى والتطبيق مغلق. لا يُسند لأحد — أوّل من يقبل يظفر به (claimOrder).
 * @param {import('mongoose').Document} order  وثيقة الطلب (pending)
 * @param {{excludeIds?: Array}} opts  كباتن يُستبعدون من الإشعار (مثل من رفض الطلب)
 */
async function broadcastOrderToCaptains(order, { excludeIds = [] } = {}) {
  order.broadcast = true;
  order.broadcastAt = new Date();
  await order.save();

  // نُحمّل بيانات صاحب الطلب لتظهر في بطاقة الطلب لدى الكابتن
  const populated = await order.populate('user', 'name lastName phone');

  // بثّ لحظي لكل الكباتن المتصلين ليظهر الطلب فورًا في قائمة الطلبات المتاحة
  try {
    io.get().to(ROOMS.captains()).emit(EVENTS.ORDER_BROADCAST, populated);
  } catch (_) {
    // السوكت غير مهيّأ (اختبارات) — نتجاهل بأمان
  }

  // إشعار Push لكل الكباتن المعتمَدين (يستثني من رفض الطلب) — يوقظهم حتى والهاتف مغلق
  const exclude = (excludeIds || []).map(String);
  Captain.find({ isApproved: true })
    .select('_id deviceTokens')
    .lean()
    .then((caps) => {
      const tokens = [];
      for (const c of caps) {
        if (exclude.includes(String(c._id))) continue;
        if (Array.isArray(c.deviceTokens)) tokens.push(...c.deviceTokens);
      }
      const uniqueTokens = [...new Set(tokens.filter(Boolean))];
      if (uniqueTokens.length) {
        return notifications.sendToTokens(uniqueTokens, notifications.orderBroadcastPayload(order));
      }
    })
    .catch((e) => logger.warn('تعذّر إرسال إشعار البثّ للكباتن:', e.message));

  return populated;
}

/**
 * قبول كابتن لطلب مبثوث (الإسناد التلقائي) — أوّل من يقبل يظفر به.
 * القبول ذرّي: نحدّث الوثيقة فقط إن كانت ما تزال pending ومبثوثة وبلا كابتن، فمن
 * يظفر بالتحديث أوّلًا يأخذ الطلب؛ ويحصل الباقون على 409 (لم يعد متاحًا).
 * @param {string} captainId
 * @param {string} orderId
 */
async function claimOrder(captainId, orderId) {
  const captain = await Captain.findById(captainId);
  if (!captain) throw httpError('الكابتن غير موجود', 404);
  if (!captain.isApproved) throw httpError('الكابتن غير معتمَد', 400);

  // احترام الحدّ الأقصى للطلبات المتزامنة (يُحسب من القاعدة لتفادي أي انحراف)
  const currentActive = await Order.countDocuments({
    captain: captain._id,
    status: { $in: ACTIVE_ORDER_STATUSES },
  });
  if (currentActive >= MAX_ACTIVE_ORDERS_PER_CAPTAIN) {
    throw httpError(`وصلت الحدّ الأقصى للطلبات المتزامنة (${MAX_ACTIVE_ORDERS_PER_CAPTAIN})`, 400);
  }

  const now = new Date();
  // القبول الذرّي: الفائز الوحيد هو من يُحدّث الوثيقة وهي ما تزال متاحة.
  // نستبعد من رفض الطلب سابقًا حتى لا يقبله مجددًا.
  const order = await Order.findOneAndUpdate(
    {
      _id: orderId,
      status: ORDER_STATUS.PENDING,
      broadcast: true,
      captain: null,
      rejectedBy: { $ne: captain._id },
    },
    {
      $set: {
        captain: captain._id,
        status: ORDER_STATUS.ACCEPTED,
        broadcast: false,
        broadcastAt: null,
        'timeline.assignedAt': now,
        'timeline.acceptedAt': now,
      },
    },
    { new: true }
  );

  if (!order) {
    // فقد السباق أو أُلغي/سُحب الطلب — لم يعد متاحًا
    throw httpError('لم يعد هذا الطلب متاحًا — أخذه كابتن آخر', 409);
  }

  // شغل الكابتن واربطه بالطلب (نعيد احتساب الحمل من القاعدة لدعم تعدّد الطلبات)
  const activeCount = await Order.countDocuments({
    captain: captain._id,
    status: { $in: ACTIVE_ORDER_STATUSES },
  });
  captain.status = CAPTAIN_STATUS.BUSY;
  captain.activeOrder = order._id;
  captain.activeOrdersCount = activeCount;
  await captain.save();

  await writeLog({
    order: order._id,
    actorId: captain._id,
    actorRole: 'captain',
    action: 'ORDER_CLAIMED',
    fromStatus: ORDER_STATUS.PENDING,
    toStatus: ORDER_STATUS.ACCEPTED,
    meta: { captainId: captain._id, mode: 'broadcast' },
  });

  const populated = await order.populate([
    { path: 'captain', select: 'name phone vehicleType' },
    { path: 'user', select: 'name lastName phone' },
  ]);

  // للكابتن الفائز: يظهر الطلب في شاشته النشطة؛ ولصاحب الطلب والأدمن: تحديث الحالة
  try {
    const io_ = io.get();
    io_.to(ROOMS.captain(String(captain._id))).emit(EVENTS.ORDER_ASSIGNED, populated);
    io_.to(ROOMS.user(String(order.user?._id || order.user))).emit(EVENTS.ORDER_STATUS_UPDATED, populated);
    io_.to(ROOMS.admins()).emit(EVENTS.ORDER_STATUS_UPDATED, populated);
  } catch (_) {
    // السوكت غير مهيّأ (اختبارات) — نتجاهل بأمان
  }
  // اختفاء الطلب من شاشات بقيّة الكباتن
  emitOrderTaken(order._id, captain._id);

  return populated;
}

/**
 * جلب الطلبات المبثوثة المتاحة للكابتن (الإسناد التلقائي) — لعرضها في تطبيق الكابتن.
 * تستثني الطلبات التي رفضها هذا الكابتن، والطلبات المجدولة التي لم يحن وقتها بعد.
 * @param {string} captainId
 */
async function getAvailableBroadcastOrders(captainId) {
  const orders = await Order.find({
    status: ORDER_STATUS.PENDING,
    broadcast: true,
    captain: null,
    rejectedBy: { $ne: captainId },
  })
    .populate('user', 'name lastName phone')
    .sort({ broadcastAt: -1, createdAt: -1 })
    .limit(50)
    .lean();

  // نستبعد الطلبات المجدولة لوقت لاحق لم يحن بعد
  return orders.filter((o) => isDue(o.scheduledAt) || o.scheduledActivated);
}

/**
 * بثّ كل الطلبات المعلّقة الحاليّة لكل الكباتن — يُستدعى عند تفعيل الأدمن للإسناد
 * التلقائي، فتظهر الطلبات القائمة فورًا للكباتن دون انتظار طلبات جديدة.
 * @returns {Promise<number>} عدد الطلبات التي بُثّت
 */
async function broadcastPendingOrders() {
  const pending = await Order.find({
    status: ORDER_STATUS.PENDING,
    captain: null,
  });

  let count = 0;
  for (const order of pending) {
    // نتخطّى الطلبات المجدولة التي لم يحن وقتها بعد
    if (order.scheduledAt && !order.scheduledActivated && !isDue(order.scheduledAt)) continue;
    try {
      await broadcastOrderToCaptains(order, { excludeIds: order.rejectedBy || [] });
      count += 1;
    } catch (err) {
      logger.warn('تعذّر بثّ طلب معلّق عند تفعيل الإسناد التلقائي:', err.message);
    }
  }
  return count;
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

// تحرير الكابتن من طلب انتهى (تسليم/إلغاء/إعادة للمجمّع). Card 95: نعيد احتساب
// الحمل من الطلبات المتبقّية، فيبقى مشغولًا (busy) إن كان لديه طلبات أخرى نشطة،
// أو يعود متاحًا (online) عند خلوّه. يُستدعى بعد حفظ الحالة الجديدة للطلب.
async function releaseCaptain(captainId) {
  if (!captainId) return;
  await syncCaptainWorkload(captainId);
}

/**
 * Card 80: حذف الحساب الخارجي المؤقّت بعد انتهاء طلبه.
 * يُستدعى عند وصول الطلب لحالة نهائية (تسليم/إلغاء). لا يحذف إلا الحسابات
 * المُعلَّمة `isExternal` (المُنشأة تلقائيًا لطلب خارجي ولم تُسجَّل من التطبيق)،
 * وفقط إن لم يبقَ لها طلب نشط آخر (يتكفّل حارس adminService.deleteUser بذلك،
 * فيرمي 409 عند وجود طلب نشط، ونتجاهله). أخطاء الحذف لا تُفشِل تدفّق الحالة.
 * @param {string|import('mongoose').Types.ObjectId} userId
 */
async function maybeDeleteExternalCustomer(userId) {
  try {
    if (!userId) return;
    const user = await User.findById(userId).select('isExternal role');
    if (!user || !user.isExternal || user.role !== 'user') return;
    await adminService.deleteUser(userId, 'system');
  } catch (err) {
    // 409 = للحساب طلب نشط آخر → نُبقيه؛ أي خطأ آخر لا يجب أن يعطّل تدفّق الطلب
    logger.warn('تعذّر حذف الحساب الخارجي المؤقّت:', err.message);
  }
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

async function updateOrderStatus(
  captainId,
  orderId,
  nextStatus,
  reason = '',
  deliveryCode = '',
  finalPrice = null
) {
  // نطلب رمز التسليم صراحةً (select:false) لأنّنا قد نحتاجه للتحقّق عند التسليم.
  const order = await Order.findById(orderId).select('+deliveryCode');
  if (!order) throw httpError('الطلب غير موجود', 404);
  if (String(order.captain) !== String(captainId)) {
    throw httpError('هذا الطلب غير مُسنَد إليك', 403);
  }

  const allowed = ALLOWED_TRANSITIONS[order.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw httpError(`انتقال غير مسموح: ${order.status} -> ${nextStatus}`, 400);
  }

  // Card 27: عند التسليم يحدّد الكابتن السعر الحقيقي (≤ السعر التقريبي) ثم يُدخل
  // رمز التسليم لتأكيد الاستلام. نتحقّق من الاثنين قبل تنفيذ أي خصم.
  let realPrice = 0;
  if (nextStatus === ORDER_STATUS.DELIVERED) {
    realPrice = Number(finalPrice);
    if (!(realPrice > 0)) {
      throw httpError('أدخل السعر الحقيقي للتوصيل قبل تأكيد التسليم', 400);
    }
    if (realPrice > order.price) {
      throw httpError(
        `السعر الحقيقي (${realPrice} ₪) يجب ألّا يتجاوز السعر التقريبي (${order.price} ₪)`,
        400
      );
    }
    // تأكيد التسليم برمز صاحب الطلب (Card 20): لا يُقبل "تم التسليم" إلا برمز صحيح.
    // استثناء الطلبات القديمة: الطلبات المُنشأة قبل ميزة رمز التسليم لا تملك رمزًا
    // مخزّنًا (deliveryCode فارغ)، فكان يتعذّر إغلاقها وتبقى عالقة في "جار التوصيل".
    // نتخطّى التحقّق لهذه الطلبات فقط — أمّا الطلبات الجديدة فتُولّد رمزًا دائمًا عند
    // الإنشاء، فيبقى التحقّق ساريًا عليها بالكامل.
    if (order.deliveryCode && !verifyDeliveryCode(order.deliveryCode, deliveryCode)) {
      throw httpError('رمز التسليم غير صحيح — اطلبه من صاحب الطلب', 400);
    }
    // خصم السعر الحقيقي من محفظة المستخدم (ذرّي؛ يرمي إن لم يكفِ الرصيد).
    await walletService.chargeForOrder(order.user, realPrice, order._id);
  }

  const from = order.status;
  order.status = nextStatus;

  // ختم الطابع الزمني للمرحلة المناسبة
  if (nextStatus === ORDER_STATUS.ACCEPTED) order.timeline.acceptedAt = new Date();
  if (nextStatus === ORDER_STATUS.PICKED_UP) order.timeline.pickedUpAt = new Date();
  if (nextStatus === ORDER_STATUS.DELIVERED) {
    order.timeline.deliveredAt = new Date();
    // Card 27: التسوية على أساس السعر الحقيقي — نسبة الكابتن ٨٠٪ تُضاف لمحفظته،
    // والباقي عمولة الشركة. (نحفظ السعر الحقيقي على الطلب لدفتر الأرباح.)
    order.finalPrice = realPrice;
    const net = Math.round(realPrice * CAPTAIN_SHARE);
    order.captainNet = net;
    order.commission = realPrice - net;
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

  // Card 90: تسوية عمولة الشركة تلقائيًا وفورًا عند التسليم بدل تسويتها يدويًا من
  // لوحة الأدمن. نزيد settledCommission بقيمة عمولة هذا الطلب، فيبقى "المستحقّ
  // للشركة" صفرًا دائمًا. (نبقي مسار التسوية اليدوي للأدمن كحلٍّ احتياطي.)
  if (nextStatus === ORDER_STATUS.DELIVERED && order.commission > 0) {
    try {
      await Captain.updateOne(
        { _id: captainId },
        { $inc: { settledCommission: order.commission } }
      );
      await writeLog({
        order: order._id,
        actorId: captainId,
        actorRole: 'system',
        action: 'COMMISSION_AUTO_SETTLED',
        meta: { amount: order.commission },
      });
    } catch (e) {
      logger.warn('تعذّرت التسوية التلقائية لعمولة الطلب:', e.message);
    }
  }

  // Card 27: بعد إضافة نسبة الكابتن لمحفظته، نبثّ رصيده المحدّث لحظيًا لتحديث شاشته.
  if (nextStatus === ORDER_STATUS.DELIVERED) {
    captainWallet
      .getBalance(captainId)
      .then((bal) => {
        io.get().to(ROOMS.captain(String(captainId))).emit(EVENTS.CAPTAIN_WALLET_UPDATED, bal);
      })
      .catch((e) => logger.warn('تعذّر بثّ رصيد محفظة الكابتن بعد التسليم:', e.message));

    // Card 83: إشعار الكابتن بإتمام التوصيل وإضافة أرباحه، وتشجيعه على الاستمرار.
    // ننتظر إنشاءه (createInApp تبتلع أخطاءها داخليًا فلا يعيق تدفّق التسليم).
    await notifications.createInApp(captainId, 'captain', {
      title: '✅ تم تأكيد التسليم',
      body: `تم توصيل الطلب بنجاح وأُضيف ${order.captainNet} ₪ إلى محفظتك. تابع لاستقبال طلبات جديدة!`,
      data: { type: 'DELIVERY_DONE', orderId: String(order._id), amount: order.captainNet },
    });
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

  // Card 80: بعد انتهاء الطلب (تسليم/إلغاء) نحذف الحساب الخارجي المؤقّت إن وُجد
  if (nextStatus === ORDER_STATUS.DELIVERED || nextStatus === ORDER_STATUS.CANCELLED) {
    await maybeDeleteExternalCustomer(order.user);
  }
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
  // Card 47: نُسجّل الرفض لهذا الكابتن مع السبب ليبقى ظاهرًا في صفحة طلباته كـ"مرفوض".
  if (captainId && !order.rejections.some((r) => String(r.captain) === String(captainId))) {
    order.rejections.push({ captain: captainId, reason, at: new Date() });
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
  // Card 103: إشعار Push لأجهزة الأدمن بأنّ طلبًا عاد بحاجة لإعادة إسناد
  notifications.notifyAdmins(notifications.orderNeedsReassignAdminPayload(order)).catch(() => {});

  // إعلام الكابتن السابق ليختفي الطلب من شاشته فورًا دون تحديث (Cards: رفض/انتقال لغير متصل).
  // في هذه اللحظة الطلب pending وبلا كابتن، فتعرف شاشة الكابتن أنه لم يعد مُسنَدًا إليها.
  if (captainId) {
    io.get().to(ROOMS.captain(String(captainId))).emit(EVENTS.ORDER_STATUS_UPDATED, order);
  }

  // الإسناد التلقائي (بثّ لكل الكباتن): يُعاد بثّ الطلب لكل الكباتن (عدا من رفضه)
  // ليأخذه أوّل من يقبل من جديد.
  if (settingsService.isBroadcastMode()) {
    try {
      return await broadcastOrderToCaptains(order, { excludeIds: order.rejectedBy || [] });
    } catch (err) {
      logger.warn('فشل إعادة بثّ الطلب للكباتن:', err.message);
    }
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
  }).populate('captain', 'name phone');

  for (const order of stale) {
    // نلتقط بيانات الكابتن قبل إلغاء الإسناد (returnToPool يصفّر order.captain)
    const timedOutCaptain = order.captain
      ? { id: String(order.captain._id), name: order.captain.name, phone: order.captain.phone }
      : null;
    const captainId = order.captain?._id || order.captain;

    await returnToPoolAndReassign(order, captainId, {
      actorRole: 'system',
      action: 'ORDER_ASSIGN_TIMEOUT',
    });

    // Card 54: تنبيه الأدمن بأن الكابتن لم يقبل الطلب خلال المهلة، وأنّ الطلب
    // عاد بلا كابتن مُسنَد. يُبثّ لغرفة الأدمن ليظهر فورًا في اللوحة.
    try {
      io.get().to(ROOMS.admins()).emit(EVENTS.ORDER_ASSIGN_TIMEOUT, {
        orderId: String(order._id),
        captain: timedOutCaptain,
        timeoutSeconds: env.acceptTimeoutSeconds,
        message: timedOutCaptain
          ? `لم يقبل الكابتن ${timedOutCaptain.name} الطلب خلال ${Math.round(env.acceptTimeoutSeconds / 60)} دقائق — عاد الطلب بلا كابتن مُسنَد`
          : 'لم يُقبَل الطلب خلال المهلة — عاد الطلب بلا كابتن مُسنَد',
      });
    } catch (_) {
      // السوكت غير مهيّأ (اختبارات) — نتجاهل بأمان
    }
  }
  return stale.length;
}

/**
 * Card 40: تنبيه الأدمن بأي طلب قيد التوصيل تجاوز زمنه التقديري (مع مهلة سماح).
 * يُبثّ حدث ORDER_DELAYED للأدمن ويُسجَّل في السجلّ مرّة واحدة (delayWarnedAt)
 * لمنع تكرار التنبيه. يُستدعى دوريًا من المُشغّل الخلفي.
 * @returns {Promise<number>} عدد الطلبات التي نُبّه عنها في هذه الدورة
 */
async function warnDelayedOrders(now = new Date()) {
  const inProgress = await Order.find({
    status: { $in: [ORDER_STATUS.ACCEPTED, ORDER_STATUS.PICKED_UP] },
    etaMinutes: { $gt: 0 },
    delayWarnedAt: null,
  }).populate('user', 'name phone').populate('captain', 'name phone');

  let warned = 0;
  for (const order of inProgress) {
    if (!isOrderDelayed(order, now)) continue;

    order.delayWarnedAt = now;
    await order.save();
    warned += 1;

    await writeLog({
      order: order._id,
      actorRole: 'system',
      action: 'ORDER_DELAYED',
      meta: { etaMinutes: order.etaMinutes, dueAt: deliveryDueAt(order) },
    });

    try {
      io.get().to(ROOMS.admins()).emit(EVENTS.ORDER_DELAYED, {
        orderId: String(order._id),
        status: order.status,
        etaMinutes: order.etaMinutes,
        dueAt: deliveryDueAt(order),
        captain: order.captain
          ? { id: String(order.captain._id), name: order.captain.name, phone: order.captain.phone }
          : null,
        user: order.user
          ? { id: String(order.user._id), name: order.user.name, phone: order.user.phone }
          : null,
        message: 'الطلب تجاوز زمنه التقديري — يُرجى مراجعة الكابتن',
      });
    } catch (_) {
      // السوكت غير مهيّأ (اختبارات) — نتجاهل بأمان
    }
  }
  return warned;
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
  const wasBroadcast = order.broadcast;

  order.status = ORDER_STATUS.CANCELLED;
  order.timeline.cancelledAt = new Date();
  order.cancelReason = reason || (actorRole === 'admin' ? 'ألغاه الأدمن' : 'ألغاه المستخدم');
  order.broadcast = false;
  order.broadcastAt = null;
  await order.save();

  // إن كان الطلب مبثوثًا لكل الكباتن (ولم يُقبَل بعد) نُخبرهم أنّه لم يعد متاحًا
  if (wasBroadcast) emitOrderTaken(order._id);

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

  // Card 80: إلغاء الطلب يُنهيه → احذف الحساب الخارجي المؤقّت إن وُجد
  await maybeDeleteExternalCustomer(order.user);

  return order;
}

// الأدمن يُغلق طلبًا عالقًا إداريًّا (يضعه "تم التسليم") — لتصفية الطلبات القديمة
// التي لا يمكن إغلاقها عبر التدفّق العادي (مثلًا طلبات ما قبل ميزة رمز التسليم،
// أو كابتن لم يعد نشطًا). إغلاق إداريّ فقط: بلا خصم من محفظة المستخدم وبلا صرف
// نسبة للكابتن (تُسوّى نقدًا خارج النظام)، مع تسجيل الإجراء في سجلّ التدقيق.
const FORCE_COMPLETABLE = [
  ORDER_STATUS.ASSIGNED,
  ORDER_STATUS.ACCEPTED,
  ORDER_STATUS.PICKED_UP,
];

async function forceCompleteByAdmin(orderId, { actorId } = {}) {
  const order = await Order.findById(orderId);
  if (!order) throw httpError('الطلب غير موجود', 404);
  if (!FORCE_COMPLETABLE.includes(order.status)) {
    throw httpError(`لا يمكن إغلاق طلب في حالته الحالية (${order.status})`, 400);
  }

  const from = order.status;
  const captainId = order.captain;

  order.status = ORDER_STATUS.DELIVERED;
  order.timeline.deliveredAt = new Date();
  await order.save();

  await releaseCaptain(captainId); // تحرير الكابتن إن كان مُسنَدًا
  chat.purgeOrderMessages(order._id); // حذف رسائل الدردشة بعد الإغلاق (Card 18)

  await writeLog({
    order: order._id,
    actorId,
    actorRole: 'admin',
    action: 'ORDER_FORCE_COMPLETED',
    fromStatus: from,
    toStatus: ORDER_STATUS.DELIVERED,
    meta: { note: 'إغلاق إداريّ لطلب عالق (بلا تسوية مالية)' },
  });

  broadcastOrderUpdate(order);
  pushOrderStatusToUser(order); // إشعار المستخدم بتغيّر الحالة (بلا انتظار)

  // Card 80: الإغلاق الإداريّ يُنهي الطلب (تسليم) → احذف الحساب الخارجي المؤقّت إن وُجد
  await maybeDeleteExternalCustomer(order.user);
  return order;
}

// جلب الطلبات النشطة (للوحة الأدمن)
async function getActiveOrders() {
  // Card 73: نضمّ رمز التسليم (select:false افتراضيًا) ليظهر للأدمن في لوحة التحكم
  // مباشرةً بعد ظهور الطلب. هذا المسار للأدمن فقط، فلا يتسرّب الرمز للكابتن/العميل.
  const orders = await Order.find({
    status: { $in: [ORDER_STATUS.PENDING, ORDER_STATUS.ASSIGNED, ORDER_STATUS.ACCEPTED, ORDER_STATUS.PICKED_UP] },
  })
    .select('+deliveryCode')
    // Card 81: نضمّ isExternal ليُظهر الأدمن زرّ إضافة الرصيد للحسابات الخارجية فقط
    .populate('user', 'name lastName phone isExternal')
    .populate('captain', 'name phone status')
    .sort({ createdAt: -1 })
    .lean();

  // Card 88: نُرفق رصيد محفظة صاحب كل طلب ليظهر في اللوحة فور إنشاء الطلب (استعلام
  // واحد لكل المحافظ). Card 87: يُستخدم أيضًا لعرض/تعديل رصيد الحسابات الخارجية.
  const userIds = orders.map((o) => o.user?._id).filter(Boolean);
  const wallets = await Wallet.find({ user: { $in: userIds } }).select('user balance').lean();
  const balanceByUser = new Map(wallets.map((w) => [String(w.user), w.balance]));
  for (const o of orders) {
    if (o.user) o.user.balance = balanceByUser.get(String(o.user._id)) || 0;
  }
  return orders;
}

/**
 * Card 74: تعديل الأدمن للسعر التقريبي (سقف الطلب) من لوحة التحكم.
 * السعر التقريبي `price` هو السقف الذي لا يستطيع الكابتن تجاوزه عند إدخال السعر
 * الحقيقي (يُطبَّق في updateOrderStatus). بعد التعديل يصبح هذا هو السقف الرسمي.
 * يُسمح بالتعديل قبل التسليم/الإلغاء فقط، وبحدٍّ أدنى للأجرة، ويُبثّ التحديث لحظيًا
 * للأدمن وصاحب الطلب والكابتن المُسنَد.
 * @param {string} orderId
 * @param {number} newPrice  السعر التقريبي الجديد (₪)
 * @param {{actorId?:string}} ctx
 */
async function updateOrderPrice(orderId, newPrice, { actorId = null } = {}) {
  const price = Math.round(Number(newPrice));
  if (!Number.isFinite(price) || price < pricing.TARIFF.minFare) {
    throw httpError(`السعر التقريبي يجب ألّا يقلّ عن ${pricing.TARIFF.minFare} ₪`, 400);
  }

  const order = await Order.findById(orderId).select('+deliveryCode');
  if (!order) throw httpError('الطلب غير موجود', 404);
  if ([ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED].includes(order.status)) {
    throw httpError('لا يمكن تعديل سعر طلب منتهٍ', 400);
  }

  const from = order.price;
  order.price = price;
  await order.save();

  await writeLog({
    order: order._id,
    actorId,
    actorRole: 'admin',
    action: 'PRICE_UPDATED',
    meta: { from, to: price },
  });

  // نُعيد التحميل بالبيانات المرتبطة ونبثّ التحديث لكل الأطراف ليظهر السقف الجديد فورًا
  await order.populate('user', 'name lastName phone');
  await order.populate('captain', 'name phone status');
  const io_ = io.get();
  const userId = String(order.user?._id || order.user);
  io_.to(ROOMS.admins()).emit(EVENTS.ORDER_STATUS_UPDATED, order);
  io_.to(ROOMS.user(userId)).emit(EVENTS.ORDER_STATUS_UPDATED, order);
  io_.to(ROOMS.order(String(order._id))).emit(EVENTS.ORDER_STATUS_UPDATED, order);
  if (order.captain) {
    const capId = String(order.captain?._id || order.captain);
    io_.to(ROOMS.captain(capId)).emit(EVENTS.ORDER_STATUS_UPDATED, order);
  }

  return order;
}

/**
 * Card 82: الأدمن يرسل رمز التسليم إلى إشعارات الكابتن المُسنَد (بأيقونة الأدمن)
 * ليعطيه إياه عند تعذّر حصوله عليه من صاحب الطلب (طلبات خارجية مثلًا).
 * يظهر الإشعار لدى الكابتن مع علامة الأدمن ورسالة تطلب إدخال الرمز عند التسليم.
 * @param {string} orderId
 */
async function sendDeliveryCodeToCaptain(orderId) {
  const order = await Order.findById(orderId).select('+deliveryCode');
  if (!order) throw httpError('الطلب غير موجود', 404);
  if (!order.captain) throw httpError('لا يوجد كابتن مُسنَد لهذا الطلب', 400);
  if (!order.deliveryCode) throw httpError('لا يوجد رمز تسليم لهذا الطلب', 400);

  const payload = {
    title: '🔑 رمز تسليم الطلب (من الإدارة)',
    body: `رمز تسليم الطلب هو ${order.deliveryCode} — أدخله عند الضغط على "تم التسليم" لتأكيد الاستلام.`,
    // fromAdmin: يُظهر أيقونة الأدمن بجانب الإشعار لدى الكابتن (Card 82)
    data: {
      type: 'DELIVERY_CODE',
      orderId: String(order._id),
      code: order.deliveryCode,
      fromAdmin: true,
    },
  };
  // ننتظر إنشاء الإشعار داخل التطبيق ليكون الرمز جاهزًا لدى الكابتن قبل الردّ.
  await notifications.createInApp(order.captain, 'captain', payload);

  // إشعار Push للكابتن إن كان له جهاز مسجّل
  Captain.findById(order.captain)
    .select('deviceTokens')
    .then((cap) => {
      if (cap?.deviceTokens?.length) return notifications.sendToTokens(cap.deviceTokens, payload);
    })
    .catch((e) => logger.warn('تعذّر إرسال رمز التسليم للكابتن:', e.message));

  return { sent: true };
}

// بحث/فلترة الطلبات مع ترقيم (للوحة الأدمن) — يعيد العناصر والإجمالي وعدد الصفحات
async function listOrders(rawQuery = {}) {
  const filter = buildOrderFilter(rawQuery);
  const { page, limit, skip } = parsePagination(rawQuery);

  // نُشغّل جلب الصفحة والعدّ الكلّي بالتوازي
  const [items, total] = await Promise.all([
    Order.find(filter)
      // Card 73: رمز التسليم يظهر للأدمن في صفحة بحث الطلبات (مسار أدمن فقط)
      .select('+deliveryCode')
      .populate('user', 'name phone')
      .populate('captain', 'name phone status')
      // Card 47: نُحضِر أسماء الكباتن الذين رفضوا الطلب لعرض سبب الرفض في لوحة الأدمن
      .populate('rejections.captain', 'name phone')
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

// جلب كل الكباتن المعتمَدين (متصلين وغير متصلين) مع علامة الحالة — لقائمة الإسناد
// في لوحة الأدمن (Card 34 + Card 35). Card 95: يجوز الإسناد لكابتن مشغول ما لم
// يبلغ الحدّ الأقصى للطلبات المتزامنة، ونُظهر عدد طلباته النشطة (activeOrdersCount).
async function getAssignableCaptains() {
  const captains = await Captain.find({ isApproved: true })
    .select('name phone vehicleType currentLocation rating status activeOrder activeOrdersCount')
    .sort({ status: 1, name: 1 }) // busy/offline/online مرتّبة نصيًا؛ الترتيب النهائي في الواجهة
    .lean();
  return captains.map((c) => {
    const activeOrdersCount = c.activeOrdersCount || 0;
    return {
      ...c,
      activeOrdersCount,
      maxOrders: MAX_ACTIVE_ORDERS_PER_CAPTAIN,
      // متاح للإسناد ما دام لم يبلغ الحدّ الأقصى (يشمل المشغول تحت الحدّ)
      assignable: activeOrdersCount < MAX_ACTIVE_ORDERS_PER_CAPTAIN,
      online: c.status === CAPTAIN_STATUS.ONLINE,
    };
  });
}

// جلب طلب واحد للتتبّع — مع التحقّق من صلاحية الوصول (صاحب الطلب/الكابتن المُسنَد/الأدمن)
async function getOrderForTracking(orderId, requesterId, requesterRole) {
  // Card 2: نضمّ رمز التسليم ليتمكّن صاحب الطلب من رؤيته في صفحة تفاصيل الطلب.
  // (يُحذف لاحقًا من ردّ الكابتن في المتحكّم — الكابتن يتحقّق منه ولا يراه.)
  const order = await Order.findById(orderId)
    .select('+deliveryCode')
    // Card 77: نضمّ صورة الكابتن (avatarUrl) ليراها العميل ضمن تفاصيل طلبه
    .populate('captain', 'name phone vehicleType currentLocation status avatarUrl')
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
    // Card 77: صورة الكابتن تظهر للعميل في سجلّ طلباته
    .populate('captain', 'name phone vehicleType rating avatarUrl')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);
}

// سجلّ طلبات الكابتن (المُسنَدة إليه) — مرتّبة من الأحدث.
// نُحمّل الاسم الكامل (name + lastName) والهاتف لعرض تفاصيل صاحب الطلب في شاشة الكابتن.
async function getCaptainOrders(captainId, { limit = 20, skip = 0 } = {}) {
  // Card 47: نضمّ الطلبات المُسنَدة حاليًا للكابتن + الطلبات التي رفضها سابقًا،
  // لتبقى الأخيرة ظاهرة في صفحة طلباته كـ"مرفوض" مع سبب الرفض.
  const orders = await Order.find({
    $or: [{ captain: captainId }, { 'rejections.captain': captainId }],
  })
    // Card 100: نضمّ صورة صاحب الطلب ليراها الكابتن في أعلى الدردشة
    .populate('user', 'name lastName phone avatarUrl')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  return orders.map((o) => {
    const mine = (o.rejections || []).find((r) => String(r.captain) === String(captainId));
    const rejectedByMe = !!mine && String(o.captain) !== String(captainId);
    // لا نُسرّب سجلّ رفض بقية الكباتن لهذا الكابتن
    const { rejections, ...rest } = o;
    return {
      ...rest,
      rejectedByMe,
      rejectReason: rejectedByMe ? (mine.reason || '') : undefined,
      rejectedAt: rejectedByMe ? mine.at : undefined,
    };
  });
}

/**
 * تحويل الكابتن إلى "غير متصل" (offline) — يُستدعى من REST ومن السوكت.
 * كل طلب نشط لم يُستَلم بعد (assigned/accepted) يُرفَض فورًا، يُعاد إلى مجمّع
 * الأدمن لإسناده لكابتن آخر، ويختفي من شاشة الكابتن لحظيًا (Card 16).
 * Card 95: يعالج كل الطلبات النشطة (لا طلبًا واحدًا) لدعم تعدّد الطلبات.
 * الطلبات التي بعد الاستلام (picked_up) لا تُمَسّ.
 */
async function setCaptainOffline(captainId) {
  const captain = await Captain.findById(captainId);
  if (!captain) throw Object.assign(new Error('الكابتن غير موجود'), { statusCode: 404 });

  // Card 95: أعِد كل الطلبات قبل الاستلام للمجمّع (قد تكون أكثر من طلب).
  const prePickupOrders = await Order.find({
    captain: captainId,
    status: { $in: [ORDER_STATUS.ASSIGNED, ORDER_STATUS.ACCEPTED] },
  });
  for (const activeOrder of prePickupOrders) {
    // يعيده للمجمّع (يحرّر الكابتن + يبثّ للكابتن ليختفي + يعيد الإسناد لآخر)
    await returnToPoolAndReassign(activeOrder, captainId, {
      actorRole: 'captain',
      action: 'ORDER_REJECTED_CAPTAIN_OFFLINE',
    });
  }

  // نضبط الكابتن غير متصل ونعيد احتساب حمله من الطلبات المتبقّية (picked_up تبقى)
  const remainingActive = await Order.find({
    captain: captainId,
    status: { $in: ACTIVE_ORDER_STATUSES },
  })
    .select('_id')
    .sort({ createdAt: -1 })
    .lean();
  const updated = await Captain.findByIdAndUpdate(
    captainId,
    {
      status: CAPTAIN_STATUS.OFFLINE,
      activeOrdersCount: remainingActive.length,
      activeOrder: remainingActive.length ? remainingActive[0]._id : null,
    },
    { new: true }
  ).select('name status');

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
      .select('price finalPrice commission captainNet')
      .lean(),
  ]);
  if (!captain) throw Object.assign(new Error('الكابتن غير موجود'), { statusCode: 404 });

  // Card 28: إجمالي التحصيل يُحسب على السعر الحقيقي (finalPrice) لا التقريبي.
  const rows = delivered.map((o) => ({ ...o, price: effectivePrice(o) }));
  const summary = summarizeWallet(rows, captain.settledCommission);
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
    .select('price finalPrice timeline.deliveredAt')
    .lean();

  // Card 28: الأرباح تُحسب على السعر الحقيقي (finalPrice) لا التقريبي.
  return summarizeEarnings(
    delivered.map((o) => ({ price: effectivePrice(o), deliveredAt: o.timeline?.deliveredAt }))
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
  createOrderByAdmin,
  activateDueScheduledOrders,
  assignOrder,
  autoAssignOrder,
  findNearestCaptain,
  broadcastOrderToCaptains,
  claimOrder,
  getAvailableBroadcastOrders,
  broadcastPendingOrders,
  updateOrderStatus,
  rejectOrder,
  expireStaleAssignments,
  warnDelayedOrders,
  cancelOrder,
  forceCompleteByAdmin,
  updateOrderPrice,
  sendDeliveryCodeToCaptain,
  getActiveOrders,
  listOrders,
  getOrdersForExport,
  getAvailableCaptains,
  getAssignableCaptains,
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
