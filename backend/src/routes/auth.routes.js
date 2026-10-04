'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { validateBody } = require('../middlewares/validate.middleware');
const { rateLimit } = require('../middlewares/rateLimit.middleware');
const { uploadAvatar, uploadCaptainDocs } = require('../middlewares/upload.middleware');
const Captain = require('../models/Captain');
const User = require('../models/User');
const { V } = require('../utils/validate');
const { GOVERNORATES } = require('../utils/governorates');
const { ROLES } = require('../utils/constants');
const { normalizePhone } = require('../utils/phone');

// حدّ أشدّ على مسارات المصادقة لمنع هجمات التخمين (brute force)
const authLimiter = rateLimit({ windowMs: 60_000, max: 20 });
// حدود إضافية مرتبطة بالهوية نفسها، حتى لا يمكن تجاوز الحماية بتوزيع المحاولات
// على عناوين IP كثيرة أو إغراق بريد واحد بطلبات إعادة التعيين.
const forgotPasswordIdentityLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 3,
  keyGenerator: (req) => `forgot:${String(req.body?.email || '').trim().toLowerCase()}`,
});
const resetPasswordIdentityLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  keyGenerator: (req) => `reset:${String(req.body?.email || '').trim().toLowerCase()}`,
});
// رفع مستندات الهوية مكلف بالمساحة؛ حد مستقل أكثر تشددًا.
const captainApplyLimiter = rateLimit({ windowMs: 60 * 60_000, max: 5 });

// لا نكشف في استجابة 401 هل رقم الحساب موجود أم أن كلمة المرور فقط خاطئة.
function maskUnauthorizedLogin(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode === 401) return originalJson({ message: 'بيانات الدخول غير صحيحة' });
    return originalJson(body);
  };
  next();
}

// منع إصدار JWT لكابتن غير معتمد مع إبقاء verifyPassword مسؤولًا فقط عن
// التحقق من كلمة المرور. في /login نحافظ على أولوية حساب User كما في controller.
async function rejectUnapprovedCaptainLogin(req, res, next) {
  try {
    const phone = normalizePhone(req.body?.phone);
    if (!phone) return next();

    if (req.path === '/login' && await User.exists({ phone })) return next();

    const captain = await Captain.findOne({ phone }).select('isApproved').lean();
    if (captain && !captain.isApproved) {
      return res.status(401).json({ message: 'بيانات الدخول غير صحيحة' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

function requireStrongCaptainApplicationPassword(req, res, next) {
  if (String(req.body?.password || '').length < 10) {
    return res.status(400).json({ message: 'كلمة السر ١٠ أحرف على الأقل' });
  }
  next();
}

const registerSchema = {
  name: [V.required, V.string],
  lastName: [V.string],
  phone: [V.required, V.palestinianMobile],
  password: [V.required, V.minLength(10)],
  email: [V.email],
  governorate: [V.string, V.isIn(GOVERNORATES)],
  address: [V.string],
};
const loginSchema = {
  phone: [V.required, V.phone],
  password: [V.required],
};
const captainRegisterSchema = {
  name: [V.required, V.string],
  phone: [V.required, V.phone],
  password: [V.required, V.minLength(10)],
  vehicleType: [V.isIn(['bicycle', 'electric', 'motorcycle'])],
};

router.post('/register', authLimiter, validateBody(registerSchema), ctrl.registerUser);
router.post('/merchant/login', authLimiter, maskUnauthorizedLogin, ctrl.loginMerchant);
router.post('/login', authLimiter, maskUnauthorizedLogin, validateBody(loginSchema), rejectUnapprovedCaptainLogin, ctrl.loginUser);
router.post('/captain/login', authLimiter, maskUnauthorizedLogin, validateBody(loginSchema), rejectUnapprovedCaptainLogin, ctrl.loginCaptain);

const forgotPasswordSchema = {
  email: [V.required, V.email],
};
const resetPasswordSchema = {
  email: [V.required, V.email],
  code: [V.required, V.minLength(6)],
  newPassword: [V.required, V.minLength(10)],
};
router.post('/password/forgot', authLimiter, validateBody(forgotPasswordSchema), forgotPasswordIdentityLimiter, ctrl.forgotPassword);
router.post('/password/reset', authLimiter, validateBody(resetPasswordSchema), resetPasswordIdentityLimiter, ctrl.resetPassword);

// تسجيل كابتن من التطبيق (طلب توثيق) — عام لكن بحد رفع مستقل شديد.
router.post('/captain/apply', captainApplyLimiter, uploadCaptainDocs, requireStrongCaptainApplicationPassword, ctrl.applyCaptain);

const updateProfileSchema = {
  name: [V.string],
  lastName: [V.string],
  email: [V.email],
  city: [V.string],
  governorate: [V.string, V.isIn(GOVERNORATES)],
  address: [V.string],
};
router.get('/me', authenticate, ctrl.me);
router.patch('/me', authenticate, validateBody(updateProfileSchema), ctrl.updateProfile);
router.post('/me/email/verification', authLimiter, authenticate, ctrl.resendEmailVerification);
router.post(
  '/me/email/verify',
  authLimiter,
  authenticate,
  validateBody({ code: [V.required, V.minLength(6)] }),
  ctrl.verifyEmail
);
const changePasswordSchema = {
  currentPassword: [V.required],
  newPassword: [V.required, V.minLength(10)],
};
router.patch('/me/password', authLimiter, authenticate, validateBody(changePasswordSchema), ctrl.changePassword);
router.post('/me/avatar', authenticate, uploadAvatar.single('avatar'), ctrl.uploadAvatar);
router.delete('/me', authenticate, ctrl.deleteOwnAccount);
router.post(
  '/captain/register',
  authenticate,
  authorize(ROLES.ADMIN),
  validateBody(captainRegisterSchema),
  ctrl.registerCaptain
);

module.exports = router;
