'use strict';

const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const env = require('../config/env');
const User = require('../models/User');
const Captain = require('../models/Captain');
const CaptainApplication = require('../models/CaptainApplication');
const Merchant = require('../models/Merchant');
const { saveAvatar, deleteAvatarByUrl } = require('../utils/avatarStore');
const adminService = require('../services/admin.service');
const notifications = require('../services/notification.service');
const { sendMail } = require('../services/email.service');
const io = require('../sockets/io');
const { idDocUrlFor } = require('../middlewares/upload.middleware');
const { ROLES, ROOMS } = require('../utils/constants');
const { normalizePhone } = require('../utils/phone');

// البريد اختياري بالكامل. إذا أُضيف، نطبّعه ونرسل رمز تحقق دون منع استخدام الحساب.
function normalizeOptionalEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return email || null;
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function generateEmailCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function emailCard({ title, body, code, note }) {
  return `<div dir="rtl" style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#1f2937">
    <div style="font-size:28px;font-weight:800;color:#f97316;margin-bottom:18px">Yalla Delivery</div>
    <h2 style="margin:0 0 12px">${title}</h2>
    <p style="line-height:1.8">${body}</p>
    <div dir="ltr" style="font-size:32px;font-weight:800;letter-spacing:8px;text-align:center;background:#fff7ed;border:1px solid #fed7aa;border-radius:14px;padding:16px;margin:20px 0">${code}</div>
    <p style="color:#6b7280;line-height:1.7">${note}</p>
  </div>`;
}

async function issueVerificationCode(user) {
  if (!user.email || user.emailVerifiedAt) return false;
  const code = generateEmailCode();
  user.emailVerificationCodeHash = hashCode(code);
  user.emailVerificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await user.save();
  await sendMail({
    to: user.email,
    subject: 'رمز تأكيد بريدك في Yalla Delivery',
    text: `رمز تأكيد بريدك هو: ${code}. الرمز صالح لمدة 24 ساعة.`,
    html: emailCard({
      title: 'تأكيد البريد الإلكتروني',
      body: 'أدخل الرمز التالي داخل تطبيق Yalla لتأكيد بريدك الإلكتروني. يمكنك استخدام التطبيق حتى قبل التأكيد.',
      code,
      note: 'الرمز صالح لمدة 24 ساعة. إذا لم تطلب هذه الرسالة يمكنك تجاهلها.',
    }),
  });
  return true;
}

async function issuePasswordResetCode(user) {
  const code = generateEmailCode();
  user.passwordResetCodeHash = hashCode(code);
  user.passwordResetExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await user.save();
  await sendMail({
    to: user.email,
    subject: 'رمز إعادة تعيين كلمة المرور - Yalla Delivery',
    text: `رمز إعادة تعيين كلمة المرور هو: ${code}. الرمز صالح لمدة 15 دقيقة.`,
    html: emailCard({
      title: 'إعادة تعيين كلمة المرور',
      body: 'استخدم الرمز التالي داخل تطبيق Yalla لإنشاء كلمة مرور جديدة.',
      code,
      note: 'الرمز صالح لمدة 15 دقيقة. إذا لم تطلب إعادة التعيين فلا تشارك الرمز مع أي شخص.',
    }),
  });
}

function publicUser(user) {
  const obj = user.toObject ? user.toObject() : user;
  return {
    ...obj,
    emailVerified: Boolean(obj.emailVerifiedAt),
  };
}

// توليد توكن JWT يحمل المعرّف والدور (وحقولًا إضافيّة اختياريّة مثل regions للأدمن)
function signToken(id, role, extra = {}) {
  return jwt.sign({ id, role, ...extra }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

// تسجيل مستخدم جديد (عميل)
async function registerUser(req, res, next) {
  try {
    const { name, lastName, phone, password, governorate, address } = req.body;
    const email = normalizeOptionalEmail(req.body.email);
    if (await Merchant.exists({ phone })) {
      return res.status(409).json({ message: 'رقم الجوال مستخدم في حساب متجر' });
    }
    if (email && await User.exists({ email })) {
      return res.status(409).json({ message: 'البريد الإلكتروني مستخدَم بالفعل' });
    }
    // البريد اختياري: لا نضع الحقل أصلًا عند تركه فارغًا حتى يبقى الفهرس sparse صحيحًا.
    const user = new User({
      name,
      lastName,
      phone,
      ...(email ? { email } : {}),
      governorate,
      address,
      role: ROLES.USER,
    });
    await user.setPassword(password); // تشفير كلمة المرور
    await user.save();

    // إرسال رمز التحقق لا يمنع إنشاء الحساب أو استخدامه إذا تعذّر SMTP.
    if (email) issueVerificationCode(user).catch(() => {});

    // Card 105: إشعار المشرفين (داخل التطبيق + Push لنسخة أندرويد) بزبون جديد.
    // آمن: fire-and-forget لا يؤثّر على إنشاء الحساب إن فشل.
    notifications
      .notifyAdmins(notifications.newUserAdminPayload(user))
      .catch(() => {});

    const token = signToken(user._id, user.role);
    res.status(201).json({
      token,
      user: {
        id: user._id,
        name,
        lastName: user.lastName,
        phone,
        email: user.email || null,
        emailVerified: Boolean(user.emailVerifiedAt),
        governorate: user.governorate,
        address: user.address,
        role: user.role,
      },
    });
  } catch (err) {
    next(err);
  }
}

// تسجيل دخول موحّد: مستخدم/أدمن ثم كابتن ثم صاحب متجر.
async function loginUser(req, res, next) {
  try {
    const phone = normalizePhone(req.body.phone);
    const { password } = req.body;

    // 1) مستخدم أو أدمن
    const user = await User.findOne({ phone }).select('+passwordHash');
    if (user) {
      if (!(await user.verifyPassword(password))) {
        return res.status(401).json({ message: 'بيانات الدخول غير صحيحة' });
      }
      if (!user.isActive) {
        return res.status(403).json({ message: 'الحساب معطّل — تواصل مع الدعم' });
      }
      // Card 110: نطاق مناطق الأدمن يُحمَل في التوكن ويُعاد للوحة لتفلتر واجهتها
      const regions = user.role === ROLES.ADMIN ? user.regions || [] : [];
      const token = signToken(user._id, user.role, regions.length ? { regions } : {});
      return res.json({
        token,
        user: {
          id: user._id,
          name: user.name,
          lastName: user.lastName,
          phone,
          email: user.email || null,
          emailVerified: Boolean(user.emailVerifiedAt),
          role: user.role,
          ...(user.role === ROLES.ADMIN ? { regions } : {}),
        },
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

    // 3) صاحب مطعم/محل
    const merchant = await Merchant.findOne({ phone })
      .select('+passwordHash')
      .populate('restaurant', 'name imageUrl active');
    if (merchant) {
      if (!(await merchant.verifyPassword(password))) {
        return res.status(401).json({ message: 'كلمة السر غير صحيحة' });
      }
      if (!merchant.isActive) {
        return res.status(403).json({ message: 'حساب المتجر معطّل — تواصل مع الإدارة' });
      }
      const token = signToken(merchant._id, ROLES.MERCHANT, {
        restaurantId: String(merchant.restaurant?._id || merchant.restaurant),
      });
      return res.json({
        token,
        user: {
          id: merchant._id,
          name: merchant.name,
          phone: merchant.phone,
          role: ROLES.MERCHANT,
          restaurant: merchant.restaurant,
        },
      });
    }

    return res.status(401).json({ message: 'بيانات الدخول غير صحيحة' });
  } catch (err) {
    next(err);
  }
}

// دخول خاص بتطبيق Yalla Partner. لا يمرّ على حسابات الزبائن والكباتن، ويعيد
// رسالة دقيقة تساعد صاحب المتجر على معرفة هل الرقم أم كلمة السر هي المشكلة.
async function loginMerchant(req, res, next) {
  try {
    const phone = normalizePhone(req.body?.phone);
    const password = String(req.body?.password || '');
    if (!/^\+?\d{6,15}$/.test(phone) || !password) {
      return res.status(400).json({ message: 'أدخل رقم الجوال وكلمة السر' });
    }

    const merchant = await Merchant.findOne({ phone })
      .select('+passwordHash')
      .populate('restaurant', 'name imageUrl active');
    if (!merchant) {
      return res.status(401).json({ message: 'لا يوجد حساب متجر بهذا الرقم' });
    }
    if (!(await merchant.verifyPassword(password))) {
      return res.status(401).json({ message: 'كلمة السر غير صحيحة' });
    }
    if (!merchant.isActive) {
      return res.status(403).json({ message: 'حساب المتجر معطّل — تواصل مع الإدارة' });
    }
    if (!merchant.restaurant || merchant.restaurant.active === false) {
      return res.status(403).json({ message: 'المتجر غير مفعّل — تواصل مع الإدارة' });
    }

    const token = signToken(merchant._id, ROLES.MERCHANT, {
      restaurantId: String(merchant.restaurant._id),
    });
    return res.json({
      token,
      user: {
        id: merchant._id,
        name: merchant.name,
        phone: merchant.phone,
        role: ROLES.MERCHANT,
        restaurant: merchant.restaurant,
      },
    });
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
    if (await Merchant.exists({ phone })) {
      return res.status(409).json({ message: 'رقم الجوال مستخدم في حساب متجر' });
    }
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
    if (await Merchant.exists({ phone: cleanPhone })) {
      return res.status(409).json({ message: 'رقم الجوال مستخدم في حساب متجر' });
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

    // Card 105: إشعار المشرفين (داخل التطبيق + Push لنسخة أندرويد) بطلب كابتن جديد
    // بحاجة للمراجعة. آمن: fire-and-forget.
    notifications
      .notifyAdmins(notifications.newCaptainApplicationAdminPayload(application))
      .catch(() => {});

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
    if (role === ROLES.MERCHANT) {
      const merchant = await Merchant.findById(id)
        .select('name phone restaurant isActive applicationStatus applicationRejectionReason')
        .populate('restaurant', 'name imageUrl category active isOpen approvalStatus approvalRejectionReason');
      if (!merchant || !merchant.isActive) {
        return res.status(404).json({ message: 'حساب المتجر غير موجود' });
      }
      return res.json({ role, merchant });
    }
    // Card 110: نضمّ regions ليعرف الأدمن نطاق مدنه في اللوحة
    const user = await User.findById(id).select('name lastName phone email emailVerifiedAt city governorate address avatarUrl role regions');
    if (!user) return res.status(404).json({ message: 'الحساب غير موجود' });
    res.json({ role: user.role, user: publicUser(user) });
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
    if (role === ROLES.MERCHANT) {
      const merchant = await Merchant.findByIdAndUpdate(
        id,
        pick(req.body, ['name']),
        { new: true, runValidators: true }
      ).select('name phone restaurant isActive');
      if (!merchant) return res.status(404).json({ message: 'الحساب غير موجود' });
      return res.json({ role, merchant });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: 'الحساب غير موجود' });

    for (const key of ['name', 'lastName', 'city', 'governorate', 'address']) {
      if (req.body[key] !== undefined && req.body[key] !== null) user[key] = req.body[key];
    }

    let emailChanged = false;
    if (Object.prototype.hasOwnProperty.call(req.body, 'email')) {
      const nextEmail = normalizeOptionalEmail(req.body.email);
      const currentEmail = normalizeOptionalEmail(user.email);
      emailChanged = nextEmail !== currentEmail;
      if (emailChanged && nextEmail && await User.exists({ _id: { $ne: id }, email: nextEmail })) {
        return res.status(409).json({ message: 'البريد الإلكتروني مستخدَم بالفعل' });
      }
      if (emailChanged) {
        user.email = nextEmail || undefined;
        user.emailVerifiedAt = null;
        user.emailVerificationCodeHash = null;
        user.emailVerificationExpiresAt = null;
        user.passwordResetCodeHash = null;
        user.passwordResetExpiresAt = null;
      }
    }

    await user.save();
    if (emailChanged && user.email) issueVerificationCode(user).catch(() => {});

    const fresh = await User.findById(id).select(
      'name lastName phone email emailVerifiedAt city governorate address avatarUrl role'
    );
    res.json({ role: user.role, user: publicUser(fresh) });
  } catch (err) {
    // بريد مكرّر (فهرس فريد) → رسالة واضحة بدل خطأ 500
    if (err.code === 11000) {
      return res.status(409).json({ message: 'البريد الإلكتروني مستخدَم بالفعل' });
    }
    next(err);
  }
}

// رفع/تحديث الصورة الشخصية (Card 17) — الملفّ في req.file عبر multer (في الذاكرة).
// Card 102: نخزّن الصورة في قاعدة البيانات (FileAsset) بدل القرص المؤقّت حتى لا
// تختفي بعد إعادة تشغيل الاستضافة، ونعرّض رابطًا ثابتًا /files/<id>.
async function uploadAvatar(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'أرفق صورة' });
    const { id, role } = req.auth;
    if (role === ROLES.MERCHANT) {
      return res.status(400).json({ message: 'غيّر صورة المتجر من إعدادات المتجر' });
    }
    const Model = role === ROLES.CAPTAIN ? Captain : User;

    // نحفظ الصورة الجديدة في قاعدة البيانات ثم نحذف القديمة (إن كانت مخزّنة عندنا)
    const url = await saveAvatar(req.file, { owner: id, ownerRole: role });
    const account = await Model.findById(id).select('avatarUrl');
    await deleteAvatarByUrl(account && account.avatarUrl);

    await Model.findByIdAndUpdate(id, { avatarUrl: url });
    res.json({ ok: true, avatarUrl: url });
  } catch (err) {
    next(err);
  }
}

// إعادة إرسال رمز تحقق البريد للمستخدم الحالي. البريد يبقى اختياريًا ولا يمنع الاستخدام.
async function resendEmailVerification(req, res, next) {
  try {
    if (req.auth.role !== ROLES.USER) {
      return res.status(400).json({ message: 'التحقق بالبريد متاح لحسابات المستخدمين فقط' });
    }
    const user = await User.findById(req.auth.id)
      .select('+emailVerificationCodeHash +emailVerificationExpiresAt');
    if (!user) return res.status(404).json({ message: 'الحساب غير موجود' });
    if (!user.email) return res.status(400).json({ message: 'أضف بريدًا إلكترونيًا إلى حسابك أولًا' });
    if (user.emailVerifiedAt) {
      return res.json({ ok: true, verified: true, message: 'البريد الإلكتروني مؤكّد بالفعل' });
    }
    await issueVerificationCode(user);
    res.json({ ok: true, message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني' });
  } catch (err) {
    next(err);
  }
}

async function verifyEmail(req, res, next) {
  try {
    if (req.auth.role !== ROLES.USER) {
      return res.status(400).json({ message: 'التحقق بالبريد متاح لحسابات المستخدمين فقط' });
    }
    const code = String(req.body.code || '').trim();
    const user = await User.findById(req.auth.id)
      .select('+emailVerificationCodeHash +emailVerificationExpiresAt');
    if (!user) return res.status(404).json({ message: 'الحساب غير موجود' });
    if (!user.email) return res.status(400).json({ message: 'لا يوجد بريد إلكتروني مرتبط بالحساب' });
    if (user.emailVerifiedAt) return res.json({ ok: true, verified: true });

    const valid =
      user.emailVerificationCodeHash &&
      user.emailVerificationExpiresAt &&
      user.emailVerificationExpiresAt.getTime() > Date.now() &&
      crypto.timingSafeEqual(
        Buffer.from(user.emailVerificationCodeHash),
        Buffer.from(hashCode(code))
      );
    if (!valid) {
      return res.status(400).json({ message: 'رمز التحقق غير صحيح أو منتهي الصلاحية' });
    }

    user.emailVerifiedAt = new Date();
    user.emailVerificationCodeHash = null;
    user.emailVerificationExpiresAt = null;
    await user.save();
    res.json({ ok: true, verified: true, message: 'تم تأكيد البريد الإلكتروني' });
  } catch (err) {
    next(err);
  }
}

// طلب إعادة تعيين كلمة المرور بالبريد. الرد موحّد حتى لا يكشف وجود حساب ببريد معيّن.
async function forgotPassword(req, res, next) {
  try {
    const email = normalizeOptionalEmail(req.body.email);
    const user = email
      ? await User.findOne({ email, emailVerifiedAt: { $ne: null }, isActive: true })
          .select('+passwordResetCodeHash +passwordResetExpiresAt')
      : null;

    if (user) {
      await issuePasswordResetCode(user).catch(() => {});
    }

    res.json({
      ok: true,
      message: 'إذا كان البريد مرتبطًا بحساب مؤكّد، تم إرسال رمز إعادة التعيين',
    });
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const email = normalizeOptionalEmail(req.body.email);
    const code = String(req.body.code || '').trim();
    const newPassword = String(req.body.newPassword || '');

    const user = email
      ? await User.findOne({ email, isActive: true })
          .select('+passwordHash +passwordResetCodeHash +passwordResetExpiresAt')
      : null;

    const storedHash = user?.passwordResetCodeHash;
    const suppliedHash = hashCode(code);
    const valid =
      user &&
      storedHash &&
      user.passwordResetExpiresAt &&
      user.passwordResetExpiresAt.getTime() > Date.now() &&
      storedHash.length === suppliedHash.length &&
      crypto.timingSafeEqual(Buffer.from(storedHash), Buffer.from(suppliedHash));

    if (!valid) {
      return res.status(400).json({ message: 'رمز إعادة التعيين غير صحيح أو منتهي الصلاحية' });
    }

    await user.setPassword(newPassword);
    user.passwordResetCodeHash = null;
    user.passwordResetExpiresAt = null;
    await user.save();

    sendMail({
      to: user.email,
      subject: 'تم تغيير كلمة المرور - Yalla Delivery',
      text: 'تم تغيير كلمة مرور حسابك في Yalla Delivery بنجاح. إذا لم تكن أنت من قام بذلك، تواصل مع الدعم فورًا.',
      html: emailCard({
        title: 'تم تغيير كلمة المرور',
        body: 'تم تغيير كلمة مرور حسابك في Yalla Delivery بنجاح.',
        code: '✓',
        note: 'إذا لم تكن أنت من قام بهذا التغيير، تواصل مع support@yalladelivery.org فورًا.',
      }),
    }).catch(() => {});

    res.json({ ok: true, message: 'تم تعيين كلمة المرور الجديدة بنجاح' });
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

    const Model = role === ROLES.CAPTAIN ? Captain : role === ROLES.MERCHANT ? Merchant : User;
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
    if (role !== ROLES.MERCHANT) {
      const recipientRole = role === ROLES.CAPTAIN ? 'captain' : 'user';
      notifications.createInApp(id, recipientRole, {
        title: '🔒 تم تغيير كلمة السر',
        body: 'تم تغيير كلمة سر حسابك بنجاح. إن لم تكن أنت من قام بذلك تواصل مع الدعم فورًا.',
        data: { type: 'PASSWORD_CHANGED' },
      });
    }

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
    if (role === ROLES.ADMIN || role === ROLES.MERCHANT) {
      return res.status(403).json({ message: 'حسابات الإدارة والمتاجر تُدار من لوحة الأدمن' });
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
  loginMerchant,
  loginCaptain,
  registerCaptain,
  applyCaptain,
  me,
  updateProfile,
  resendEmailVerification,
  verifyEmail,
  forgotPassword,
  resetPassword,
  uploadAvatar,
  changePassword,
  deleteOwnAccount,
};
