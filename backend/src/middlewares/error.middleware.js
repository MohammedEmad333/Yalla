'use strict';

const logger = require('../utils/logger');

// معالج المسارات غير الموجودة (404)
function notFound(req, res, next) {
  res.status(404).json({ message: `المسار غير موجود: ${req.originalUrl}` });
}

// معالج الأخطاء المركزي — يلتقط أي خطأ يُرمى داخل المتحكّمات
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  logger.error(err.message);
  // أخطاء رفع الملفّات (multer) — مثل تجاوز الحجم — أخطاء إدخال من المستخدم (400)
  const isUpload = err.name === 'MulterError';
  const status = err.statusCode || (isUpload ? 400 : 500);
  const message = isUpload
    ? (err.code === 'LIMIT_FILE_SIZE' ? 'حجم الصورة كبير جدًّا (الحدّ 5 ميجابايت)' : err.message)
    : err.message || 'خطأ داخلي في الخادم';
  res.status(status).json({ message });
}

module.exports = { notFound, errorHandler };
