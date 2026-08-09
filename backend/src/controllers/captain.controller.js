'use strict';

const Captain = require('../models/Captain');
const io = require('../sockets/io');
const orderService = require('../services/order.service');
const { CAPTAIN_STATUS, ROOMS, EVENTS } = require('../utils/constants');

// تبديل حالة الكابتن (online/offline) عبر REST — بديل لحدث السوكت
async function toggleStatus(req, res, next) {
  try {
    const { status } = req.body; // online | offline
    if (![CAPTAIN_STATUS.ONLINE, CAPTAIN_STATUS.OFFLINE].includes(status)) {
      return res.status(400).json({ message: 'حالة غير صالحة' });
    }
    const captain = await Captain.findByIdAndUpdate(
      req.auth.id,
      { status },
      { new: true }
    ).select('name status');

    // إعلام الأدمن بتغيّر توفّر الكابتن (تحديث قائمة الإسناد)
    io.get().to(ROOMS.admins()).emit(EVENTS.CAPTAIN_STATUS_CHANGED, {
      captainId: captain._id,
      status: captain.status,
    });

    res.json(captain);
  } catch (err) {
    next(err);
  }
}

// سجلّ توصيلات الكابتن
async function myOrders(req, res, next) {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = parseInt(req.query.skip, 10) || 0;
    const orders = await orderService.getCaptainOrders(req.auth.id, { limit, skip });
    res.json(orders);
  } catch (err) {
    next(err);
  }
}

// ملخّص أرباح الكابتن
async function myEarnings(req, res, next) {
  try {
    const earnings = await orderService.getCaptainEarnings(req.auth.id);
    res.json(earnings);
  } catch (err) {
    next(err);
  }
}

module.exports = { toggleStatus, myOrders, myEarnings };
