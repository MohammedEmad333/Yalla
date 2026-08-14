'use strict';

const User = require('../models/User');
const Captain = require('../models/Captain');
const statsService = require('../services/stats.service');
const orderService = require('../services/order.service');
const walletService = require('../services/wallet.service');
const { ROLES } = require('../utils/constants');

// مؤشّرات الأداء للوحة التحكّم
async function getStats(req, res, next) {
  try {
    const stats = await statsService.getDashboardStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
}

// قائمة المستخدمين (العملاء) — بحث اختياري بالاسم/الهاتف
async function listUsers(req, res, next) {
  try {
    const { q } = req.query;
    const filter = { role: ROLES.USER };
    if (q) {
      filter.$or = [
        { name: new RegExp(q, 'i') },
        { phone: new RegExp(q, 'i') },
      ];
    }
    const users = await User.find(filter).select('name phone email isActive createdAt').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    next(err);
  }
}

// تفعيل/تعطيل مستخدم (المستخدم المعطّل لا يستطيع الدخول)
async function setUserActive(req, res, next) {
  try {
    const { isActive } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.userId,
      { isActive: !!isActive },
      { new: true }
    ).select('name phone isActive');
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
    res.json(user);
  } catch (err) {
    next(err);
  }
}

// قائمة الكباتن مع حالة الاعتماد والتوفّر
async function listCaptains(req, res, next) {
  try {
    const captains = await Captain.find()
      .select('name phone vehicleType status isApproved rating ratingsCount createdAt')
      .sort({ createdAt: -1 });
    res.json(captains);
  } catch (err) {
    next(err);
  }
}

// اعتماد/إلغاء اعتماد كابتن (غير المعتمَد لا يستقبل طلبات)
async function setCaptainApproval(req, res, next) {
  try {
    const { isApproved } = req.body;
    const captain = await Captain.findByIdAndUpdate(
      req.params.captainId,
      { isApproved: !!isApproved },
      { new: true }
    ).select('name phone isApproved');
    if (!captain) return res.status(404).json({ message: 'الكابتن غير موجود' });
    res.json(captain);
  } catch (err) {
    next(err);
  }
}

// الأدمن يعرض محفظة كابتن معيّن
async function captainWallet(req, res, next) {
  try {
    const data = await orderService.getCaptainWallet(req.params.captainId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

// الأدمن يسوّي عمولة كابتن
async function settleCaptain(req, res, next) {
  try {
    const { amount } = req.body;
    const result = await orderService.settleCaptain(req.params.captainId, amount);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// ── محفظة المستخدم وشحن الرصيد (المرحلة 1: مراجعة يدوية) ──────────

// قائمة طلبات الشحن (?status=pending|approved|rejected|all)
async function listTopups(req, res, next) {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const skip = parseInt(req.query.skip, 10) || 0;
    const items = await walletService.listTopups({ status: req.query.status, limit, skip });
    res.json(items);
  } catch (err) {
    next(err);
  }
}

// الموافقة على طلب شحن → إضافة الرصيد تلقائيًّا لمحفظة المستخدم
async function approveTopup(req, res, next) {
  try {
    const { note } = req.body || {};
    const result = await walletService.approveTopup(req.auth.id, req.params.txId, note);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// رفض طلب شحن (بلا إضافة رصيد)
async function rejectTopup(req, res, next) {
  try {
    const { reason } = req.body || {};
    const result = await walletService.rejectTopup(req.auth.id, req.params.txId, reason);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// عرض محفظة مستخدم معيّن + آخر حركاته
async function userWallet(req, res, next) {
  try {
    const data = await walletService.getUserWalletForAdmin(req.params.userId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStats,
  listUsers,
  setUserActive,
  listCaptains,
  setCaptainApproval,
  captainWallet,
  settleCaptain,
  listTopups,
  approveTopup,
  rejectTopup,
  userWallet,
};
