'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const Captain = require('../models/Captain');
const { ROLES } = require('../utils/constants');

// توليد توكن JWT يحمل المعرّف والدور
function signToken(id, role) {
  return jwt.sign({ id, role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

// تسجيل مستخدم جديد (عميل)
async function registerUser(req, res, next) {
  try {
    const { name, phone, email, password } = req.body;
    const user = new User({ name, phone, email, role: ROLES.USER });
    await user.setPassword(password); // تشفير كلمة المرور
    await user.save();

    const token = signToken(user._id, user.role);
    res.status(201).json({ token, user: { id: user._id, name, phone, role: user.role } });
  } catch (err) {
    next(err);
  }
}

// تسجيل دخول المستخدم أو الأدمن
async function loginUser(req, res, next) {
  try {
    const { phone, password } = req.body;
    // نطلب حقل passwordHash صراحةً لأنه select:false
    const user = await User.findOne({ phone }).select('+passwordHash');
    if (!user || !(await user.verifyPassword(password))) {
      return res.status(401).json({ message: 'بيانات الدخول غير صحيحة' });
    }
    // المستخدم المعطّل من الأدمن لا يستطيع الدخول
    if (!user.isActive) {
      return res.status(403).json({ message: 'الحساب معطّل — تواصل مع الدعم' });
    }
    const token = signToken(user._id, user.role);
    res.json({ token, user: { id: user._id, name: user.name, phone, role: user.role } });
  } catch (err) {
    next(err);
  }
}

// تسجيل دخول الكابتن
async function loginCaptain(req, res, next) {
  try {
    const { phone, password } = req.body;
    const captain = await Captain.findOne({ phone }).select('+passwordHash');
    if (!captain || !(await captain.verifyPassword(password))) {
      return res.status(401).json({ message: 'بيانات الدخول غير صحيحة' });
    }
    const token = signToken(captain._id, ROLES.CAPTAIN);
    res.json({
      token,
      captain: { id: captain._id, name: captain.name, phone, status: captain.status },
    });
  } catch (err) {
    next(err);
  }
}

// إنشاء كابتن جديد — متاح للأدمن فقط (لا تسجيل ذاتي للكباتن)
async function registerCaptain(req, res, next) {
  try {
    const { name, phone, password, vehicleType, vehiclePlate } = req.body;
    const captain = new Captain({
      name,
      phone,
      vehicleType,
      vehiclePlate,
      isApproved: true, // الأدمن هو من ينشئه فيُعتمَد مباشرةً
    });
    await captain.setPassword(password);
    await captain.save();

    res.status(201).json({
      captain: { id: captain._id, name, phone, vehicleType: captain.vehicleType },
    });
  } catch (err) {
    next(err);
  }
}

// جلب بيانات الحساب الحالي من التوكن — يُستخدم لاستعادة الجلسة عند فتح التطبيق
async function me(req, res, next) {
  try {
    const { id, role } = req.auth;
    if (role === ROLES.CAPTAIN) {
      const captain = await Captain.findById(id).select('name phone status vehicleType activeOrder');
      if (!captain) return res.status(404).json({ message: 'الحساب غير موجود' });
      return res.json({ role, captain });
    }
    const user = await User.findById(id).select('name phone email role');
    if (!user) return res.status(404).json({ message: 'الحساب غير موجود' });
    res.json({ role: user.role, user });
  } catch (err) {
    next(err);
  }
}

module.exports = { registerUser, loginUser, loginCaptain, registerCaptain, me };
