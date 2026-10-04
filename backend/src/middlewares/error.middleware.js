'use strict';

const logger = require('../utils/logger');

// معالج المسارات غير الموجودة (404). لا نعيد query string لأنه قد يحتوي
// رموزًا أو بيانات حساسة لا يجب أن تنعكس في الاستجابة.
function notFound(req, res, next) {
  res.status(404).json({ message: `المسار غير موجود: ${req.path}` });
}

// معالج الأخطاء المركزي — يلتقط أي خطأ يُرمى داخل المتحكّمات
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const isUpload = err.name === 'MulterError';
  const rawStatus = Number(err.statusCode || err.status || (isUpload ? 400 : 500));
  const status = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599 ? rawStatus : 500;

  // احتفظ بالتفاصيل في السجل الداخلي فقط. لا نعيد رسائل أخطاء 5xx للعميل لأنها
  // قد تكشف أسماء جداول/موفّرين/مسارات أو حتى أجزاء من أسرار التهيئة.
  logger.error(err && err.message ? err.message : 'Unhandled API error');

  let message;
  if (isUpload) {
    message = err.code === 'LIMIT_FILE_SIZE'
      ? 'حجم الصورة كبير جدًّا (الحدّ 5 ميجابايت)'
      : 'تعذّر رفع الملف';
  } else if (status >= 500) {
    message = 'خطأ داخلي في الخادم';
  } else {
    message = err.message || 'طلب غير صالح';
  }

  res.status(status).json({ message });
}

module.exports = { notFound, errorHandler };
