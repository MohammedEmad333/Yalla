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

module.exports = { registerUser, loginUser, loginCaptain };
