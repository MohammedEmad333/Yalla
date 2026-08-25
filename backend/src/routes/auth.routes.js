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

// مخطّطات التحقّق
const registerSchema = {
  name: [V.required, V.string],
  lastName: [V.string], // اسم العائلة — اختياري
  phone: [V.required, V.phone],
  password: [V.required, V.minLength(6)],
  // Card 96: مكان السكن — المحافظة (من القائمة المعتمَدة) وتفاصيل العنوان.
  // اختياريان في التحقّق لضمان توافق العملاء القدامى، ويُتحقَّق من صحّة المحافظة عند إرسالها.
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
  password: [V.required, V.minLength(6)],
  vehicleType: [V.isIn(['bicycle', 'electric', 'motorcycle'])], // اختياري (Card 92)
};

// مسارات عامّة (بحدّ معدّل + تحقّق)
router.post('/register', authLimiter, validateBody(registerSchema), ctrl.registerUser);
router.post('/login', authLimiter, validateBody(loginSchema), ctrl.loginUser);
router.post('/captain/login', authLimiter, validateBody(loginSchema), ctrl.loginCaptain);

// Card 79: تسجيل كابتن من التطبيق (طلب توثيق) — عامّ، متعدّد الأجزاء (مستندات).
// التحقّق من الحقول داخل المتحكّم لأنّ multipart لا يمرّ عبر validateBody.
router.post('/captain/apply', authLimiter, uploadCaptainDocs, ctrl.applyCaptain);

// مسارات محميّة — بيانات الحساب وتحديثه ورفع الصورة الشخصية (Card 17)
const updateProfileSchema = {
  name: [V.string],
  lastName: [V.string],
  city: [V.string],
  // Card 96: يمكن تعديل مكان السكن لاحقًا من صفحة "حسابي"
  governorate: [V.string, V.isIn(GOVERNORATES)],
  address: [V.string],
};
router.get('/me', authenticate, ctrl.me);
router.patch('/me', authenticate, validateBody(updateProfileSchema), ctrl.updateProfile);
// تغيير كلمة سر الحساب (Card 72) — كلمة حالية + جديدة (٦ أحرف على الأقلّ)
const changePasswordSchema = {
  currentPassword: [V.required],
  newPassword: [V.required, V.minLength(6)],
};
router.patch(
  '/me/password',
  authLimiter,
  authenticate,
  validateBody(changePasswordSchema),
  ctrl.changePassword
);
router.post('/me/avatar', authenticate, uploadAvatar.single('avatar'), ctrl.uploadAvatar);
// حذف الحساب ذاتيًا (متطلّب Google Play) — المستخدم يحذف حسابه وبياناته المرتبطة
router.delete('/me', authenticate, ctrl.deleteOwnAccount);
router.post(
  '/captain/register',
  authenticate,
  authorize(ROLES.ADMIN),
  validateBody(captainRegisterSchema),
  ctrl.registerCaptain
);

module.exports = router;
