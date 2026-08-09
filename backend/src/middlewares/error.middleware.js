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
  const status = err.statusCode || 500;
  res.status(status).json({
    message: err.message || 'خطأ داخلي في الخادم',
  });
}

module.exports = { notFound, errorHandler };
