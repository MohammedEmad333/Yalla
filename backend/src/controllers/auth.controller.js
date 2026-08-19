'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const Captain = require('../models/Captain');
const adminService = require('../services/admin.service');
const { avatarUrlFor } = require('../middlewares/upload.middleware');
const { ROLES } = require('../utils/constants');

// توليد توكن JWT يحمل المعرّف والدور
function signToken(id, role) {
  return jwt.sign({ id, role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

// تسجيل مستخدم جديد (عميل)
async function registerUser(req, res, next) {
  try {
    const { name, lastName, phone, email, password } = req.body;
    const user = new User({ name, lastName, phone, email, role: ROLES.USER });
    await user.setPassword(password); // تشفير كلمة المرور
    await user.save();

    const token = signToken(user._id, user.role);
    res.status(201).json({
      token,
      user: { id: user._id, name, lastName: user.lastName, phone, role: user.role },
    });
  } catch (err) {
    next(err);
  }
}

// تسجيل دخول موحّد: يفحص المستخدم/الأدمن أولًا ثم الكابتن — صفحة دخول واحدة للجميع
async function loginUser(req, res, next) {
  try {
    const { phone, password } = req.body;

    // 1) مستخدم أو أدمن
    const user = await User.findOne({ phone }).select('+passwordHash');
    if (user) {
      if (!(await user.verifyPassword(password))) {
        return res.status(401).json({ message: 'بيانات الدخول غير صحيحة' });
      }
      if (!user.isActive) {
        return res.status(403).json({ message: 'الحساب معطّل — تواصل مع الدعم' });
      }
      const token = signToken(user._id, user.role);
      return res.json({
        token,
        user: { id: user._id, name: user.name, lastName: user.lastName, phone, role: user.role },
      });
    }

    // 2) كابتن
    const captain = await Captain.findOne({ phone }).select('+passwordHash');
    if (captain) {
      if (!(await captain.verifyPassword(password))) {
        return res.status(401).json({ message: 'بيانات الدخول غير صحيحة' });
      }
      const token = signToken(captain._id, ROLES.CAPTAIN);
      return res.json({
        token,
        user: { id: captain._id, name: captain.name, phone, role: ROLES.CAPTAIN },
      });
    }

    return res.status(401).json({ message: 'بيانات الدخول غير صحيحة' });
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

// جلب بيانات الحساب الحالي من التوكن — يُستخدم لاستعادة الجلسة عند فتح التطبيق.
// يشمل بيانات صفحة "حسابي" (Card 17): الصورة الشخصية، البريد، المدينة...
async function me(req, res, next) {
  try {
    const { id, role } = req.auth;
    if (role === ROLES.CAPTAIN) {
      const captain = await Captain.findById(id).select(
        'name phone status vehicleType vehiclePlate avatarUrl activeOrder rating'
      );
      if (!captain) return res.status(404).json({ message: 'الحساب غير موجود' });
      return res.json({ role, captain });
    }
    const user = await User.findById(id).select('name lastName phone email city avatarUrl role');
    if (!user) return res.status(404).json({ message: 'الحساب غير موجود' });
    res.json({ role: user.role, user });
  } catch (err) {
    next(err);
  }
}

// تحديث بيانات الحساب الحالي (Card 17): يقبل حقولًا مختارة فقط حسب الدور.
async function updateProfile(req, res, next) {
  try {
    const { id, role } = req.auth;
    if (role === ROLES.CAPTAIN) {
      const allowed = pick(req.body, ['name', 'vehiclePlate']);
      const captain = await Captain.findByIdAndUpdate(id, allowed, {
        new: true,
        runValidators: true,
      }).select('name phone status vehicleType vehiclePlate avatarUrl rating');
      if (!captain) return res.status(404).json({ message: 'الحساب غير موجود' });
      return res.json({ role, captain });
    }

    const allowed = pick(req.body, ['name', 'lastName', 'email', 'city']);
    const user = await User.findByIdAndUpdate(id, allowed, {
      new: true,
      runValidators: true,
    }).select('name lastName phone email city avatarUrl role');
    if (!user) return res.status(404).json({ message: 'الحساب غير موجود' });
    res.json({ role: user.role, user });
  } catch (err) {
    // بريد مكرّر (فهرس فريد) → رسالة واضحة بدل خطأ 500
    if (err.code === 11000) {
      return res.status(409).json({ message: 'البريد الإلكتروني مستخدَم بالفعل' });
    }
    next(err);
  }
}

// رفع/تحديث الصورة الشخصية (Card 17) — الملفّ في req.file عبر multer.
async function uploadAvatar(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'أرفق صورة' });
    const url = avatarUrlFor(req.file.filename);
    const { id, role } = req.auth;
    const Model = role === ROLES.CAPTAIN ? Captain : User;
    await Model.findByIdAndUpdate(id, { avatarUrl: url });
    res.json({ ok: true, avatarUrl: url });
  } catch (err) {
    next(err);
  }
}

// حذف الحساب الحالي وبياناته المرتبطة نهائيًا — بطلب المستخدم نفسه (Google Play:
// متطلّب حذف الحساب داخل التطبيق). يُعيد استخدام منطق الحذف الآمن (يمنع الحذف
// أثناء طلب نشط) ويسجّل الفاعل كـ "user"/"captain" للتمييز عن حذف الأدمن.
async function deleteOwnAccount(req, res, next) {
  try {
    const { id, role } = req.auth;
    if (role === ROLES.ADMIN) {
      return res.status(403).json({ message: 'لا يمكن حذف حساب أدمن من التطبيق' });
    }
    if (role === ROLES.CAPTAIN) {
      await adminService.deleteCaptain(id, ROLES.CAPTAIN);
    } else {
      await adminService.deleteUser(id, ROLES.USER);
    }
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
}

// اختيار مجموعة مفاتيح مسموح بها فقط من جسم الطلب (يتجاهل الفارغ/غير المُرسَل)
function pick(obj = {}, keys = []) {
  const out = {};
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) out[k] = obj[k];
  }
  return out;
}

module.exports = {
  registerUser,
  loginUser,
  loginCaptain,
  registerCaptain,
  me,
  updateProfile,
  uploadAvatar,
  deleteOwnAccount,
};
