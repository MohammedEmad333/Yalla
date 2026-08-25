'use strict';

const User = require('../models/User');
const Captain = require('../models/Captain');
const statsService = require('../services/stats.service');
const orderService = require('../services/order.service');
const walletService = require('../services/wallet.service');
const captainWalletService = require('../services/captainWallet.service');
const adminService = require('../services/admin.service');
const chatService = require('../services/chat.service');
const notificationService = require('../services/notification.service');
const { validateBroadcast } = require('../utils/broadcast');
const { excelUnicodeBuffer } = require('../utils/csv');
const { avatarUrlFor } = require('../middlewares/upload.middleware');
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

// Card 78: تعديل الأدمن لبيانات حساب كابتن (اسم/جوال/مركبة/كلمة سر)
async function updateCaptain(req, res, next) {
  try {
    const result = await adminService.updateCaptain(req.params.captainId, req.body || {});
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// Card 78: الأدمن يغيّر الصورة الشخصية لكابتن (الملفّ في req.file عبر multer)
async function uploadCaptainAvatar(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'أرفق صورة' });
    const url = avatarUrlFor(req.file.filename);
    const captain = await Captain.findByIdAndUpdate(
      req.params.captainId,
      { avatarUrl: url },
      { new: true }
    ).select('name avatarUrl');
    if (!captain) return res.status(404).json({ message: 'الكابتن غير موجود' });
    res.json({ ok: true, avatarUrl: url });
  } catch (err) {
    next(err);
  }
}

// ── Card 79: طلبات توثيق الكباتن + بيانات الكباتن الحسّاسة ──────────

async function listCaptainApplications(req, res, next) {
  try {
    const items = await adminService.listCaptainApplications({ status: req.query.status });
    res.json(items);
  } catch (err) {
    next(err);
  }
}

async function approveCaptainApplication(req, res, next) {
  try {
    const result = await adminService.approveCaptainApplication(req.params.applicationId);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

async function rejectCaptainApplication(req, res, next) {
  try {
    const result = await adminService.rejectCaptainApplication(req.params.applicationId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// Card 79: صفحة "بيانات الكباتن" — البيانات الحسّاسة للأدمن فقط
async function listCaptainsData(req, res, next) {
  try {
    const items = await adminService.listCaptainsData();
    res.json(items);
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

// Card 81: إضافة رصيد لحساب خارجي مؤقّت فقط (طلبات الأدمن/الواتساب) — ليكفي
// رصيده لدفع قيمة طلبه. يُرفض للحسابات الدائمة (لها مسار الشحن العاديّ).
async function creditExternalUser(req, res, next) {
  try {
    const { amount } = req.body || {};
    const value = Number(amount);
    if (!(value > 0)) return res.status(400).json({ message: 'أدخل مبلغًا صحيحًا' });

    const user = await User.findById(req.params.userId).select('isExternal role');
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
    if (user.role !== ROLES.USER || !user.isExternal) {
      return res.status(400).json({ message: 'إضافة الرصيد متاحة للحسابات الخارجية المؤقّتة فقط' });
    }

    const balance = await walletService.adminCredit(user._id, value, {
      reason: 'external_topup',
      by: String(req.auth.id),
    });
    res.json({ balance });
  } catch (err) {
    next(err);
  }
}

// Card 87: تعديل رصيد حساب خارجي مؤقّت على قيمة محدّدة (بعد إضافته) — يُرفض
// للحسابات الدائمة (لها مسار الشحن العاديّ). يعرض الأدمن الرصيد الحالي ويعدّله.
async function setExternalUserBalance(req, res, next) {
  try {
    const { balance } = req.body || {};
    const value = Number(balance);
    if (!(value >= 0)) return res.status(400).json({ message: 'أدخل رصيدًا صحيحًا' });

    const user = await User.findById(req.params.userId).select('isExternal role');
    if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });
    if (user.role !== ROLES.USER || !user.isExternal) {
      return res.status(400).json({ message: 'تعديل الرصيد متاح للحسابات الخارجية المؤقّتة فقط' });
    }

    const newBalance = await walletService.adminSetBalance(user._id, value, {
      reason: 'external_balance_edit',
      by: String(req.auth.id),
    });
    res.json({ balance: newBalance });
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

// Card 94: حذف الأدمن لرسالة دردشة واحدة من أي محادثة نهائيًا
async function deleteChatMessage(req, res, next) {
  try {
    const result = await chatService.deleteMessage(req.params.orderId, req.params.messageId);
    res.json(result);
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
    // ملفّ بترميز UTF-16LE + فاصل جدولة: عربية سليمة وأعمدة منفصلة في Excel (Card 58)
    const buffer = excelUnicodeBuffer(rows, columns);
    res.setHeader('Content-Type', 'text/csv; charset=utf-16le');
    res.setHeader('Content-Disposition', `attachment; filename="chat-${req.params.orderId}.csv"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

// ── رسائل/إشعارات الأدمن الجماعية (Card 66) ──────────────────────

// الأدمن يرسل رسالة/إشعارًا للجميع أو لكباتن/زبائن محدّدين
async function sendBroadcast(req, res, next) {
  try {
    const { audience, title, body, userIds, captainIds } = req.body || {};
    const error = validateBroadcast({ audience, title, body, userIds, captainIds });
    if (error) return res.status(400).json({ message: error });

    const result = await notificationService.sendBroadcast({
      audience,
      title,
      body,
      userIds,
      captainIds,
    });
    res.status(201).json({
      message: `أُرسلت الرسالة إلى ${result.users} زبونًا و${result.captains} كابتن`,
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStats,
  sendBroadcast,
  listUsers,
  setUserActive,
  listChats,
  getChatMessages,
  sendChatMessage,
  deleteChatMessage,
  exportChat,
  listCustomersDetailed,
  listCaptainsDetailed,
  deleteUser,
  deleteCaptain,
  listCaptains,
  setCaptainApproval,
  updateCaptain,
  uploadCaptainAvatar,
  listCaptainApplications,
  approveCaptainApplication,
  rejectCaptainApplication,
  listCaptainsData,
  captainWallet,
  settleCaptain,
  listTopups,
  approveTopup,
  rejectTopup,
  creditExternalUser,
  setExternalUserBalance,
  userWallet,
  listWithdrawals,
  processWithdrawal,
};
