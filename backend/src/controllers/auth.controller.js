'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const User = require('../models/User');
const Captain = require('../models/Captain');
const CaptainApplication = require('../models/CaptainApplication');
const adminService = require('../services/admin.service');
const notifications = require('../services/notification.service');
const io = require('../sockets/io');
const { avatarUrlFor, idDocUrlFor } = require('../middlewares/upload.middleware');
const { ROLES, ROOMS } = require('../utils/constants');

// توليد توكن JWT يحمل المعرّف والدور
function signToken(id, role) {
  return jwt.sign({ id, role }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

// تسجيل مستخدم جديد (عميل)
async function registerUser(req, res, next) {
  try {
    const { name, lastName, phone, email, password, governorate, address } = req.body;
    // Card 96: نخزّن مكان السكن (المحافظة + تفاصيل العنوان) عند إنشاء الحساب
    const user = new User({ name, lastName, phone, email, governorate, address, role: ROLES.USER });
    await user.setPassword(password); // تشفير كلمة المرور
    await user.save();

    const token = signToken(user._id, user.role);
    res.status(201).json({
      token,
      user: {
        id: user._id,
        name,
        lastName: user.lastName,
        phone,
        governorate: user.governorate,
        address: user.address,
        role: user.role,
      },
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

// Card 79: تسجيل كابتن من التطبيق — يُنشئ "طلب توثيق" قيد المراجعة (لا حساب مباشر).
// يجمع الاسم الرباعي والهاتف ورقم الهوية وتاريخ الميلاد وصورتَي الهوية والسيلفي،
// ثم يبقى الطلب pending حتى يقبله الأدمن (فيُنشأ الحساب) أو يرفضه (فيُحذف الطلب).
async function applyCaptain(req, res, next) {
  try {
    const { fullName, phone, password, nationalId, birthDate, vehicleType } = req.body || {};
    const files = req.files || {};
    const idPhoto = files.idPhoto?.[0];
    const selfie = files.selfie?.[0];

    // تحقّق أساسيّ من الحقول والمستندات
    if (!fullName || String(fullName).trim().length < 3) {
      return res.status(400).json({ message: 'أدخل الاسم الرباعي كاملًا' });
    }
    if (!phone || !/^\d{6,15}$/.test(String(phone).trim())) {
      return res.status(400).json({ message: 'أدخل رقم جوال صحيح' });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ message: 'كلمة السر ٦ أحرف على الأقلّ' });
    }
    if (!nationalId || !String(nationalId).trim()) {
      return res.status(400).json({ message: 'أدخل رقم الهوية' });
    }
    const dob = birthDate ? new Date(birthDate) : null;
    if (!dob || Number.isNaN(dob.getTime())) {
      return res.status(400).json({ message: 'أدخل تاريخ ميلاد صحيح' });
    }
    if (!idPhoto || !selfie) {
      return res.status(400).json({ message: 'أرفق صورة الهوية والسيلفي مع الهوية' });
    }

    const cleanPhone = String(phone).trim();
    // منع التكرار: هاتف يملك حساب كابتن، أو طلب توثيق معلّق بنفس الهاتف
    if (await Captain.findOne({ phone: cleanPhone })) {
      return res.status(409).json({ message: 'يوجد حساب كابتن بهذا الرقم بالفعل' });
    }
    if (await CaptainApplication.findOne({ phone: cleanPhone, status: 'pending' })) {
      return res.status(409).json({ message: 'لديك طلب توثيق قيد المراجعة بالفعل' });
    }

    const application = new CaptainApplication({
      fullName: String(fullName).trim(),
      phone: cleanPhone,
      nationalId: String(nationalId).trim(),
      birthDate: dob,
      idPhotoUrl: idDocUrlFor(idPhoto.filename),
      selfieUrl: idDocUrlFor(selfie.filename),
      // Card 92: هوائية/كهربائية/نارية — أيّ قيمة أخرى تُعامَل كنارية افتراضيًا
      vehicleType: ['bicycle', 'electric'].includes(vehicleType) ? vehicleType : 'motorcycle',
    });
    await application.setPassword(password);
    await application.save();

    // بثّ للأدمن ليظهر الطلب فورًا في صفحة طلبات الكباتن (بلا بيانات حسّاسة)
    try {
      io.get()
        .to(ROOMS.admins())
        .emit('captain:application_new', {
          id: String(application._id),
          fullName: application.fullName,
          phone: application.phone,
        });
    } catch (_) {
      /* السوكت غير مهيّأ */
    }

    res.status(201).json({
      status: 'pending',
      message: 'تم استلام طلبك وهو قيد التوثيق. سنُعلمك عند اعتماد حسابك.',
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
    const user = await User.findById(id).select('name lastName phone email city governorate address avatarUrl role');
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

    const allowed = pick(req.body, ['name', 'lastName', 'email', 'city', 'governorate', 'address']);
    const user = await User.findByIdAndUpdate(id, allowed, {
      new: true,
      runValidators: true,
    }).select('name lastName phone email city governorate address avatarUrl role');
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

// تغيير كلمة سر الحساب من داخل التطبيق (Card 72): يتحقّق من كلمة السر الحالية
// أولًا ثم يعيّن الجديدة، ويرسل إشعارًا داخليًا بأنّ كلمة السر تغيّرت.
async function changePassword(req, res, next) {
  try {
    const { id, role } = req.auth;
    const { currentPassword, newPassword } = req.body;

    const Model = role === ROLES.CAPTAIN ? Captain : User;
    const account = await Model.findById(id).select('+passwordHash');
    if (!account) return res.status(404).json({ message: 'الحساب غير موجود' });

    // التحقّق من كلمة السر الحالية قبل السماح بالتغيير
    if (!(await account.verifyPassword(currentPassword))) {
      return res.status(400).json({ message: 'كلمة السر الحالية غير صحيحة' });
    }

    // منع إعادة استخدام نفس كلمة السر (تغيير فعلي)
    if (await account.verifyPassword(newPassword)) {
      return res.status(400).json({ message: 'كلمة السر الجديدة مطابقة للحالية — اختر كلمة مختلفة' });
    }

    await account.setPassword(newPassword);
    await account.save();

    // إشعار داخلي بأنّ كلمة السر تم تغييرها بنجاح
    const recipientRole = role === ROLES.CAPTAIN ? 'captain' : 'user';
    notifications.createInApp(id, recipientRole, {
      title: '🔒 تم تغيير كلمة السر',
      body: 'تم تغيير كلمة سر حسابك بنجاح. إن لم تكن أنت من قام بذلك تواصل مع الدعم فورًا.',
      data: { type: 'PASSWORD_CHANGED' },
    });

    res.json({ ok: true, message: 'تم تغيير كلمة السر بنجاح' });
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
  applyCaptain,
  me,
  updateProfile,
  uploadAvatar,
  changePassword,
  deleteOwnAccount,
};
