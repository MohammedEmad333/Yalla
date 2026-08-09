'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');

// التحقق من توكن الـ JWT وإرفاق بيانات المستخدم بالطلب
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'التوكن مفقود' });
  }

  try {
    // payload = { id, role }
    req.auth = jwt.verify(token, env.jwtSecret);
    next();
  } catch (err) {
    return res.status(401).json({ message: 'توكن غير صالح' });
  }
}

// السماح فقط للأدوار المحدّدة (مثال: authorize('admin'))
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.auth || !allowedRoles.includes(req.auth.role)) {
      return res.status(403).json({ message: 'غير مصرّح لك بهذا الإجراء' });
    }
    next();
  };
}

module.exports = { authenticate, authorize };
