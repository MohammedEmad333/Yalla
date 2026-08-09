'use strict';

const orderService = require('../services/order.service');

const pricing = require('../services/pricing.service');

// عرض تسعيرة تقديرية (مسافة + سعر) قبل تأكيد الطلب
async function getQuote(req, res, next) {
  try {
    const { pickup, dropoff, vehicleType } = req.body; // pickup/dropoff = [lng, lat]
    if (!Array.isArray(pickup) || !Array.isArray(dropoff)) {
      return res.status(400).json({ message: 'أرسل إحداثيات الاستلام والتسليم [lng, lat]' });
    }
    res.json(pricing.quote(pickup, dropoff, vehicleType));
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
    res.json(order);
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
  cancelOrder,
  getActiveOrders,
  listOrders,
  getAvailableCaptains,
  getOrder,
  getMyOrders,
  rateOrder,
};
