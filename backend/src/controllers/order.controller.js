'use strict';

const orderService = require('../services/order.service');

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
    const { status } = req.body;
    const order = await orderService.updateOrderStatus(req.auth.id, orderId, status);
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

// الأدمن يجلب الكباتن المتاحين للإسناد
async function getAvailableCaptains(req, res, next) {
  try {
    const captains = await orderService.getAvailableCaptains();
    res.json(captains);
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
  createOrder,
  assignOrder,
  autoAssign,
  updateStatus,
  getActiveOrders,
  getAvailableCaptains,
  getOrder,
};
