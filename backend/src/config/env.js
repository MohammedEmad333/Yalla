'use strict';

// تحميل متغيّرات البيئة من ملف .env ثم تجميعها في كائن واحد.
// نلفّ الاستدعاء بحماية حتى تعمل أدوات مثل الاختبارات دون تثبيت التبعيات.
try {
  require('dotenv').config();
} catch {
  // dotenv غير مثبّت — نعتمد على متغيّرات البيئة الموجودة مباشرةً
}

const env = {
  port: parseInt(process.env.PORT, 10) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/yalla',
  jwtSecret: process.env.JWT_SECRET || 'change_me_super_secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  // تفعيل الإسناد التلقائي لأقرب كابتن عند إنشاء الطلب
  autoAssign: process.env.AUTO_ASSIGN === 'true',
  // إعدادات إشعارات Firebase (اختيارية — إن غابت تُعطَّل الإشعارات)
  fcm: {
    credentialsPath: process.env.FCM_CREDENTIALS_PATH || '',
  },
};

module.exports = env;
