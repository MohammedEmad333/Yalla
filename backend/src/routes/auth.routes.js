'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/auth.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { validateBody } = require('../middlewares/validate.middleware');
const { rateLimit } = require('../middlewares/rateLimit.middleware');
const { uploadAvatar, uploadCaptainDocs } = require('../middlewares/upload.middleware');
const { V } = require('../utils/validate');
const { GOVERNORATES } = require('../utils/governorates');
const { ROLES } = require('../utils/constants');

// حدّ أشدّ على مسارات المصادقة لمنع هجمات التخمين (brute force)
const authLimiter = rateLimit({ windowMs: 60_000, max: 20 });
// رفع مستندات الهوية مكلف بالمساحة؛ حد مستقل أكثر تشددًا.
const captainApplyLimiter = rateLimit({ windowMs: 60 * 60_000, max: 5 });

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
router.post('/merchant/login', authLimiter, ctrl.loginMerchant);
router.post('/login', authLimiter, validateBody(loginSchema), ctrl.loginUser);
router.post('/captain/login', authLimiter, validateBody(loginSchema), ctrl.loginCaptain);

const forgotPasswordSchema = {
  email: [V.required, V.email],
};
const resetPasswordSchema = {
  email: [V.required, V.email],
  code: [V.required, V.minLength(6)],
  newPassword: [V.required, V.minLength(10)],
};
router.post('/password/forgot', authLimiter, validateBody(forgotPasswordSchema), ctrl.forgotPassword);
router.post('/password/reset', authLimiter, validateBody(resetPasswordSchema), ctrl.resetPassword);

// تسجيل كابتن من التطبيق (طلب توثيق) — عام لكن بحد رفع مستقل شديد.
router.post('/captain/apply', captainApplyLimiter, uploadCaptainDocs, ctrl.applyCaptain);

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
