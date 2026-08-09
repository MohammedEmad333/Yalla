'use strict';

const User = require('../models/User');
const Captain = require('../models/Captain');
const notificationService = require('../services/notification.service');
const { ROLES } = require('../utils/constants');

// نختار الموديل المناسب حسب دور صاحب الطلب
function modelForRole(role) {
  return role === ROLES.CAPTAIN ? Captain : User;
}

// تسجيل رمز جهاز FCM للحساب الحالي (addToSet يمنع التكرار)
async function registerDeviceToken(req, res, next) {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'رمز الجهاز مطلوب' });

    const Model = modelForRole(req.auth.role);
    await Model.findByIdAndUpdate(req.auth.id, { $addToSet: { deviceTokens: token } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// إزالة رمز جهاز عند تسجيل الخروج أو إبطال الرمز
async function removeDeviceToken(req, res, next) {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: 'رمز الجهاز مطلوب' });

    const Model = modelForRole(req.auth.role);
    await Model.findByIdAndUpdate(req.auth.id, { $pull: { deviceTokens: token } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

// قائمة إشعارات الحساب الحالي + عدد غير المقروء
async function listMine(req, res, next) {
  try {
    const data = await notificationService.listForRecipient(req.auth.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

// تعليم إشعار كمقروء
async function markRead(req, res, next) {
  try {
    const notif = await notificationService.markRead(req.auth.id, req.params.id);
    res.json(notif);
  } catch (err) {
    next(err);
  }
}

// تعليم الكلّ كمقروء
async function markAllRead(req, res, next) {
  try {
    const result = await notificationService.markAllRead(req.auth.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { registerDeviceToken, removeDeviceToken, listMine, markRead, markAllRead };
