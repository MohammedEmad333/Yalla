'use strict';

const User = require('../models/User');
const Captain = require('../models/Captain');
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

module.exports = { registerDeviceToken, removeDeviceToken };
