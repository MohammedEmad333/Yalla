'use strict';

const orderService = require('../services/order.service');
const chatService = require('../services/chat.service');
const { excelUnicodeBuffer } = require('../utils/csv');
const { buildTimeline } = require('../utils/timeline');
const { estimateEtaMinutes } = require('../utils/eta');

const pricing = require('../services/pricing.service');

// عرض تسعيرة تقديرية (مسافة + سعر + زمن متوقّع) قبل تأكيد الطلب
async function getQuote(req, res, next) {
  try {
    const { pickup, dropoff, vehicleType } = req.body; // pickup/dropoff = [lng, lat]
    if (!Array.isArray(pickup) || !Array.isArray(dropoff)) {
      return res.status(400).json({ message: 'أرسل إحداثيات الاستلام والتسليم [lng, lat]' });
    }
    const q = pricing.quote(pickup, dropoff, vehicleType);
    // نرفق الزمن التقديري للتوصيل
    res.json({ ...q, etaMinutes: estimateEtaMinutes(q.distanceKm, vehicleType) });
  } catch (err) {
    next(err);
  }
}

// المستخدم ينشئ طلبًا جديدًا (يدعم ترويسة Idempotency-Key لمنع التكرار)
async function createOrder(req, res, next) {
  try {
    const idempotencyKey = req.get('Idempotency-Key');
    const order = await orderService.createOrder(req.auth.id, req.body, idempotencyKey);
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
}

// الأدمن ينشئ طلبًا نيابةً عن صاحب الطلب (Card 68)
async function createOrderByAdmin(req, res, next) {
  try {
    const order = await orderService.createOrderByAdmin(req.auth.id, req.body);
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
}

// الأدمن يُسند طلبًا لكابتن
async function assignOrder(req, res, next) {
  try {
    const { orderId } = req.params;
    const { captainId } = req.body;
    const order = await orderService.assignOrder(req.auth.id, orderId, captainId);
    res.json(order);
  } catch (err) {
    next(err);
  }
}

// الأدمن يطلب إسنادًا تلقائيًا لأقرب كابتن متاح
async function autoAssign(req, res, next) {
  try {
    const { orderId } = req.params;
    const result = await orderService.autoAssignOrder(orderId, {
      actorId: req.auth.id,
      actorRole: 'admin',
    });
    if (!result.assigned) {
      return res.status(409).json({ message: 'لا يوجد كابتن متاح قريب حاليًا', order: result.order });
    }
    res.json(result.order);
  } catch (err) {
    next(err);
  }
}

// الكابتن يحدّث حالة الطلب (accepted / picked_up / delivered)
async function updateStatus(req, res, next) {
  try {
    const { orderId } = req.params;
    const { status, reason, deliveryCode, finalPrice } = req.body;
    const order = await orderService.updateOrderStatus(
      req.auth.id,
      orderId,
      status,
      reason,
      deliveryCode,
      finalPrice
    );
    res.json(order);
  } catch (err) {
    next(err);
  }
}

// الكابتن يرفض الطلب المُسنَد مع ملاحظة سبب الرفض (يعيده للمجمّع ويُعاد إسناده) — Card 24
async function rejectOrder(req, res, next) {
  try {
    const { reason } = req.body || {};
    const order = await orderService.rejectOrder(req.auth.id, req.params.orderId, reason);
    res.json(order);
  } catch (err) {
    next(err);
  }
}

// المستخدم/الأدمن يلغي الطلب (قبل الاستلام)
async function cancelOrder(req, res, next) {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const order = await orderService.cancelOrder(
      orderId,
      { actorId: req.auth.id, actorRole: req.auth.role },
      reason
    );
    res.json(order);
  } catch (err) {
    next(err);
  }
}

// الأدمن يُغلق طلبًا عالقًا إداريًّا (تم التسليم) — لتصفية الطلبات القديمة العالقة
async function forceComplete(req, res, next) {
  try {
    const { orderId } = req.params;
    const order = await orderService.forceCompleteByAdmin(orderId, { actorId: req.auth.id });
    res.json(order);
  } catch (err) {
    next(err);
  }
}

// الأدمن يعدّل السعر التقريبي (سقف الطلب) — Card 74
async function updatePrice(req, res, next) {
  try {
    const { orderId } = req.params;
    const { price } = req.body || {};
    const order = await orderService.updateOrderPrice(orderId, price, { actorId: req.auth.id });
    res.json(order);
  } catch (err) {
    next(err);
  }
}

// الأدمن يجلب الطلبات النشطة للوحة التحكّم
async function getActiveOrders(req, res, next) {
  try {
    const orders = await orderService.getActiveOrders();
    res.json(orders);
  } catch (err) {
    next(err);
  }
}

// الأدمن يبحث/يفلتر الطلبات مع ترقيم (?status=&from=&to=&q=&page=&limit=)
async function listOrders(req, res, next) {
  try {
    const result = await orderService.listOrders(req.query);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// الأدمن يصدّر الطلبات (بنفس الفلاتر) كملفّ CSV
async function exportOrders(req, res, next) {
  try {
    const rows = await orderService.getOrdersForExport(req.query);
    const columns = [
      { key: 'id', header: 'المعرّف' },
      { key: 'status', header: 'الحالة' },
      { key: 'createdAt', header: 'تاريخ الإنشاء' },
      { key: 'deliveredAt', header: 'تاريخ التسليم' },
      { key: 'userName', header: 'العميل' },
      { key: 'userPhone', header: 'هاتف العميل' },
      { key: 'captainName', header: 'الكابتن' },
      { key: 'pickup', header: 'الاستلام' },
      { key: 'dropoff', header: 'التسليم' },
      { key: 'distanceKm', header: 'المسافة (كم)' },
      { key: 'price', header: 'السعر' },
    ];
    // ملفّ بترميز UTF-16LE + فاصل جدولة: عربية سليمة وأعمدة منفصلة في Excel
    // على كل اللغات (Card 58)
    const buffer = excelUnicodeBuffer(rows, columns);

    res.setHeader('Content-Type', 'text/csv; charset=utf-16le');
    res.setHeader('Content-Disposition', `attachment; filename="orders-${Date.now()}.csv"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

// الأدمن يجلب الكباتن المتاحين للإسناد
async function getAvailableCaptains(req, res, next) {
  try {
    const captains = await orderService.getAvailableCaptains();
    res.json(captains);
  } catch (err) {
    next(err);
  }
}

// الأدمن يجلب كل الكباتن المعتمَدين مع علامة الحالة (online/offline) للإسناد (Card 34/35)
async function getAssignableCaptains(req, res, next) {
  try {
    const captains = await orderService.getAssignableCaptains();
    res.json(captains);
  } catch (err) {
    next(err);
  }
}

// المستخدم يجلب سجلّ طلباته
async function getMyOrders(req, res, next) {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = parseInt(req.query.skip, 10) || 0;
    const orders = await orderService.getMyOrders(req.auth.id, { limit, skip });
    res.json(orders);
  } catch (err) {
    next(err);
  }
}

// المستخدم يقيّم الكابتن بعد التسليم
async function rateOrder(req, res, next) {
  try {
    const { orderId } = req.params;
    const { stars, comment } = req.body;
    if (!stars || stars < 1 || stars > 5) {
      return res.status(400).json({ message: 'قيّم من 1 إلى 5 نجوم' });
    }
    const order = await orderService.rateOrder(req.auth.id, orderId, stars, comment);
    res.json(order);
  } catch (err) {
    next(err);
  }
}

// جلب طلب واحد للتتبّع (يحمّل الحالة الأولية قبل الاعتماد على السوكت)
async function getOrder(req, res, next) {
  try {
    const order = await orderService.getOrderForTracking(
      req.params.orderId,
      req.auth.id,
      req.auth.role
    );
    // نُرفق خطوات الخطّ الزمني المحسوبة مع بيانات الطلب
    const payload = { ...order.toObject(), timelineSteps: buildTimeline(order) };
    // Card 2: رمز التسليم يظهر لصاحب الطلب (والأدمن) فقط — يُحذف من ردّ الكابتن
    // الذي يتحقّق منه عند التسليم ولا يجب أن يراه مسبقًا.
    if (req.auth.role === 'captain') delete payload.deliveryCode;
    res.json(payload);
  } catch (err) {
    next(err);
  }
}

// دردشة الطلب (Card 18): إرسال رسالة وجلب سجلّ الرسائل — لأطراف الطلب فقط
async function sendMessage(req, res, next) {
  try {
    const { text } = req.body || {};
    const message = await chatService.sendMessage(
      req.params.orderId,
      { id: req.auth.id, role: req.auth.role },
      text
    );
    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
}

async function listMessages(req, res, next) {
  try {
    const items = await chatService.listMessages(req.params.orderId, {
      id: req.auth.id,
      role: req.auth.role,
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getQuote,
  createOrder,
  createOrderByAdmin,
  assignOrder,
  autoAssign,
  updateStatus,
  rejectOrder,
  cancelOrder,
  forceComplete,
  updatePrice,
  getActiveOrders,
  listOrders,
  exportOrders,
  getAvailableCaptains,
  getAssignableCaptains,
  getOrder,
  getMyOrders,
  rateOrder,
  sendMessage,
  listMessages,
};
