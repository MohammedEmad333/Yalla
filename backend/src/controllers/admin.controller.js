'use strict';

const User = require('../models/User');
const Captain = require('../models/Captain');
const statsService = require('../services/stats.service');
const orderService = require('../services/order.service');
const walletService = require('../services/wallet.service');
const captainWalletService = require('../services/captainWallet.service');
const adminService = require('../services/admin.service');
const chatService = require('../services/chat.service');
const { toCsv } = require('../utils/csv');
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

// Card 41: قائمة الزبائن بكامل التفاصيل (رقم/اسم/عنوان/رصيد/تاريخ الانضمام)
async function listCustomersDetailed(req, res, next) {
  try {
    const items = await adminService.listCustomers({ q: req.query.q });
    res.json(items);
  } catch (err) {
    next(err);
  }
}

// Card 37 + Card 41: قائمة الكباتن بكامل التفاصيل (بما فيها الرصيد القابل للسحب)
async function listCaptainsDetailed(req, res, next) {
  try {
    const items = await adminService.listCaptainsDetailed();
    res.json(items);
  } catch (err) {
    next(err);
  }
}

// Card 38: حذف زبون نهائيًا
async function deleteUser(req, res, next) {
  try {
    const result = await adminService.deleteUser(req.params.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// Card 38: حذف كابتن نهائيًا
async function deleteCaptain(req, res, next) {
  try {
    const result = await adminService.deleteCaptain(req.params.captainId);
    res.json(result);
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

// ── طلبات سحب أرباح الكباتن (Card 19) ────────────────────────────

// قائمة طلبات السحب (?status=pending|done|rejected)
async function listWithdrawals(req, res, next) {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const items = await captainWalletService.listAllWithdrawals({
      status: req.query.status,
      limit,
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
}

// تنفيذ طلب سحب: "تم التحويل" (done) أو "رفض" (rejected)
async function processWithdrawal(req, res, next) {
  try {
    const { action, note } = req.body || {};
    const result = await captainWalletService.processWithdrawal(
      req.params.withdrawalId,
      action,
      note
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// ── مراقبة الأدمن للمحادثات (Card 32 + Card 45) ──────────────────

// Card 45: قائمة المحادثات الجارية بين الزبائن والكباتن
async function listChats(req, res, next) {
  try {
    const items = await chatService.listActiveChats({ limit: parseInt(req.query.limit, 10) || 50 });
    res.json(items);
  } catch (err) {
    next(err);
  }
}

// Card 32: عرض رسائل محادثة طلب معيّن (تشمل المؤرشفة)
async function getChatMessages(req, res, next) {
  try {
    const items = await chatService.listMessagesForAdmin(req.params.orderId);
    res.json(items);
  } catch (err) {
    next(err);
  }
}

// Card 32: مشاركة الأدمن في المحادثة (تظهر بأيقونة أدمن خاصّة لدى الطرفين)
async function sendChatMessage(req, res, next) {
  try {
    const { text } = req.body || {};
    const message = await chatService.sendMessage(
      req.params.orderId,
      { id: req.auth.id, role: ROLES.ADMIN },
      text
    );
    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
}

// Card 32: تصدير محادثة طلب بصيغة CSV (متاح حتى بعد انتهاء المحادثة/أرشفتها)
async function exportChat(req, res, next) {
  try {
    const messages = await chatService.listMessagesForAdmin(req.params.orderId);
    const roleAr = { user: 'صاحب الطلب', captain: 'الكابتن', admin: 'الأدمن' };
    const rows = messages.map((m) => ({
      time: m.createdAt ? new Date(m.createdAt).toISOString() : '',
      sender: roleAr[m.senderRole] || m.senderRole,
      text: m.text,
    }));
    const columns = [
      { key: 'time', header: 'الوقت' },
      { key: 'sender', header: 'المُرسِل' },
      { key: 'text', header: 'الرسالة' },
    ];
    const csv = '﻿' + toCsv(rows, columns);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="chat-${req.params.orderId}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStats,
  listUsers,
  setUserActive,
  listChats,
  getChatMessages,
  sendChatMessage,
  exportChat,
  listCustomersDetailed,
  listCaptainsDetailed,
  deleteUser,
  deleteCaptain,
  listCaptains,
  setCaptainApproval,
  captainWallet,
  settleCaptain,
  listTopups,
  approveTopup,
  rejectTopup,
  userWallet,
  listWithdrawals,
  processWithdrawal,
};
