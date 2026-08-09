'use strict';

const orderService = require('../services/order.service');
const { toCsv } = require('../utils/csv');
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

// المستخدم ينشئ طلبًا جديدًا
async function createOrder(req, res, next) {
  try {
    const order = await orderService.createOrder(req.auth.id, req.body);
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
    const { status, reason } = req.body;
    const order = await orderService.updateOrderStatus(req.auth.id, orderId, status, reason);
    res.json(order);
  } catch (err) {
    next(err);
  }
}

// الكابتن يرفض الطلب المُسنَد (يعيده للمجمّع ويُعاد إسناده)
async function rejectOrder(req, res, next) {
  try {
    const order = await orderService.rejectOrder(req.auth.id, req.params.orderId);
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
    // BOM لضمان عرض العربية بشكل صحيح في Excel
    const csv = '﻿' + toCsv(rows, columns);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="orders-${Date.now()}.csv"`);
    res.send(csv);
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
    res.json({ ...order.toObject(), timelineSteps: buildTimeline(order) });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getQuote,
  createOrder,
  assignOrder,
  autoAssign,
  updateStatus,
  rejectOrder,
  cancelOrder,
  getActiveOrders,
  listOrders,
  exportOrders,
  getAvailableCaptains,
  getOrder,
  getMyOrders,
  rateOrder,
};
