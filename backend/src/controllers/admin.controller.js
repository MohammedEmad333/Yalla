'use strict';

const User = require('../models/User');
const Captain = require('../models/Captain');
const Merchant = require('../models/Merchant');
const statsService = require('../services/stats.service');
const orderService = require('../services/order.service');
const captainWalletService = require('../services/captainWallet.service');
const adminService = require('../services/admin.service');
const settingsService = require('../services/settings.service');
const chatService = require('../services/chat.service');
const notificationService = require('../services/notification.service');
const adminWalletService = require('../services/adminWallet.service');
const { validateBroadcast } = require('../utils/broadcast');
const { excelUnicodeBuffer } = require('../utils/csv');
const { saveAvatar, deleteAvatarByUrl } = require('../utils/avatarStore');
const { ROLES } = require('../utils/constants');
const { normalizePhone } = require('../utils/phone');

async function getStats(req, res, next) {
  try {
    const stats = await statsService.getDashboardStats();
    res.json(stats);
  } catch (err) {
    next(err);
  }
}

async function resetStats(req, res, next) {
  try {
    const settings = await settingsService.resetStats();
    res.json({ ok: true, statsResetAt: settings.statsResetAt });
  } catch (err) {
    next(err);
  }
}

async function getAdminWallet(req, res, next) {
  try {
    res.json(await adminWalletService.getWallet(req.query));
  } catch (err) {
    next(err);
  }
}

async function exportAdminWallet(req, res, next) {
  try {
    const wallet = await adminWalletService.getWallet({ ...req.query, limit: 100, skip: 0 });
    const rows = wallet.transactions.map((tx) => ({
      orderId: String(tx.orderId),
      restaurant: tx.restaurantName || 'طلب توصيل',
      customer: [tx.customer?.name, tx.customer?.lastName].filter(Boolean).join(' '),
      phone: tx.customer?.phone || '',
      captain: tx.captain?.name || '',
      type: tx.type,
      items: tx.itemsAmount,
      commission: tx.commissionAmount,
      amount: tx.amount,
      balanceBefore: tx.balanceBefore ?? '',
      balanceAfter: tx.balanceAfter ?? '',
      date: tx.deliveredAt ? new Date(tx.deliveredAt).toISOString() : '',
    }));
    const columns = [
      { key: 'orderId', header: 'رقم الطلب' },
      { key: 'restaurant', header: 'المتجر' },
      { key: 'customer', header: 'الزبون' },
      { key: 'phone', header: 'الهاتف' },
      { key: 'captain', header: 'الكابتن' },
      { key: 'type', header: 'نوع الحركة' },
      { key: 'items', header: 'قيمة الأصناف' },
      { key: 'commission', header: 'العمولة' },
      { key: 'amount', header: 'دخل الإدارة' },
      { key: 'balanceBefore', header: 'رصيد الإدارة قبل' },
      { key: 'balanceAfter', header: 'رصيد الإدارة بعد' },
      { key: 'date', header: 'التاريخ' },
    ];
    res.setHeader('Content-Type', 'text/csv; charset=utf-16le');
    res.setHeader('Content-Disposition', `attachment; filename="admin-wallet-${Date.now()}.csv"`);
    res.send(excelUnicodeBuffer(rows, columns));
  } catch (err) {
    next(err);
  }
}

async function getUserCounts(req, res, next) {
  try {
    const [customers, captains] = await Promise.all([
      User.countDocuments({ role: ROLES.USER }),
      Captain.countDocuments({}),
    ]);
    res.json({ customers, captains, total: customers + captains });
  } catch (err) {
    next(err);
  }
}

async function getAdminAccount(req, res, next) {
  try {
    const admin = await User.findOne({ _id: req.auth.id, role: ROLES.ADMIN }).select('name phone');
    if (!admin) return res.status(404).json({ message: 'حساب الأدمن غير موجود' });
    res.json({ id: admin._id, name: admin.name, phone: admin.phone });
  } catch (err) {
    next(err);
  }
}

async function updateAdminAccount(req, res, next) {
  try {
    const admin = await User.findOne({ _id: req.auth.id, role: ROLES.ADMIN }).select('+passwordHash');
    if (!admin) return res.status(404).json({ message: 'حساب الأدمن غير موجود' });
    const currentPassword = String(req.body.currentPassword || '');
    if (!currentPassword || !(await admin.verifyPassword(currentPassword))) {
      return res.status(401).json({ message: 'كلمة السر الحالية غير صحيحة' });
    }
    if (req.body.phone !== undefined) {
      const phone = normalizePhone(req.body.phone);
      if (!/^\+?\d{6,15}$/.test(phone)) {
        return res.status(400).json({ message: 'أدخل رقم جوال صحيح' });
      }
      const collision = await Promise.all([
        User.exists({ _id: { $ne: admin._id }, phone }),
        Captain.exists({ phone }),
        Merchant.exists({ phone }),
      ]);
      if (collision.some(Boolean)) {
        return res.status(409).json({ message: 'رقم الجوال مستخدم في حساب آخر' });
      }
      admin.phone = phone;
    }
    if (req.body.newPassword) {
      if (String(req.body.newPassword).length < 6) {
        return res.status(400).json({ message: 'كلمة السر الجديدة ٦ أحرف على الأقل' });
      }
      await admin.setPassword(String(req.body.newPassword));
    }
    await admin.save();
    res.json({ id: admin._id, name: admin.name, phone: admin.phone });
  } catch (err) {
    next(err);
  }
}

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
    const users = await User.find(filter)
      .select('name phone email isActive createdAt')
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    next(err);
  }
}

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

async function listCustomersDetailed(req, res, next) {
  try {
    const items = await adminService.listCustomers({ q: req.query.q });
    res.json(items);
  } catch (err) {
    next(err);
  }
}

async function listCaptainsDetailed(req, res, next) {
  try {
    const items = await adminService.listCaptainsDetailed();
    res.json(items);
  } catch (err) {
    next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    const result = await adminService.deleteUser(req.params.userId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function deleteCaptain(req, res, next) {
  try {
    const result = await adminService.deleteCaptain(req.params.captainId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function updateCaptain(req, res, next) {
  try {
    const result = await adminService.updateCaptain(req.params.captainId, req.body || {});
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function uploadCaptainAvatar(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'أرفق صورة' });
    const prev = await Captain.findById(req.params.captainId).select('avatarUrl');
    if (!prev) return res.status(404).json({ message: 'الكابتن غير موجود' });
    const url = await saveAvatar(req.file, {
      owner: req.params.captainId,
      ownerRole: ROLES.CAPTAIN,
    });
    await deleteAvatarByUrl(prev.avatarUrl);
    await Captain.findByIdAndUpdate(req.params.captainId, { avatarUrl: url });
    res.json({ ok: true, avatarUrl: url });
  } catch (err) {
    next(err);
  }
}

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

async function listCaptainsData(req, res, next) {
  try {
    const items = await adminService.listCaptainsData();
    res.json(items);
  } catch (err) {
    next(err);
  }
}

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

async function captainWallet(req, res, next) {
  try {
    const data = await orderService.getCaptainWallet(req.params.captainId);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function settleCaptain(req, res, next) {
  try {
    const { amount } = req.body;
    const result = await orderService.settleCaptain(req.params.captainId, amount);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

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

async function listChats(req, res, next) {
  try {
    const items = await chatService.listActiveChats({
      limit: parseInt(req.query.limit, 10) || 50,
    });
    res.json(items);
  } catch (err) {
    next(err);
  }
}

async function getChatMessages(req, res, next) {
  try {
    const items = await chatService.listMessagesForAdmin(req.params.orderId);
    res.json(items);
  } catch (err) {
    next(err);
  }
}

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

async function deleteChatMessage(req, res, next) {
  try {
    const result = await chatService.deleteMessage(req.params.orderId, req.params.messageId);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

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
    const buffer = excelUnicodeBuffer(rows, columns);
    res.setHeader('Content-Type', 'text/csv; charset=utf-16le');
    res.setHeader('Content-Disposition', `attachment; filename="chat-${req.params.orderId}.csv"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

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

async function getSettings(req, res, next) {
  try {
    const settings = await settingsService.getSettings();
    res.json(settings);
  } catch (err) {
    next(err);
  }
}

async function updateSettings(req, res, next) {
  try {
    const { autoAssignBroadcast } = req.body || {};
    const patch = {};
    if (typeof autoAssignBroadcast === 'boolean') {
      patch.autoAssignBroadcast = autoAssignBroadcast;
    }

    const settings = await settingsService.updateSettings(patch);
    let broadcasted = 0;
    if (patch.autoAssignBroadcast === true) {
      broadcasted = await orderService.broadcastPendingOrders();
    }

    res.json({ ...settings, broadcasted });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStats,
  resetStats,
  getAdminWallet,
  exportAdminWallet,
  getUserCounts,
  getAdminAccount,
  updateAdminAccount,
  getSettings,
  updateSettings,
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
  listWithdrawals,
  processWithdrawal,
};
