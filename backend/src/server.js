'use strict';

const http = require('http');
const { Server } = require('socket.io');

const env = require('./config/env');
const app = require('./app');
const connectDB = require('./config/db');
const registerSocketHandlers = require('./sockets/order.socket');
const { startScheduler } = require('./services/scheduler.service');
const notifications = require('./services/notification.service');
const settingsService = require('./services/settings.service');
const logger = require('./utils/logger');

// نقطة الإقلاع: نربط Express + Socket.io على خادم HTTP واحد
async function bootstrap() {
  await connectDB(); // 1) الاتصال بقاعدة البيانات

  // تحميل إعدادات المنظومة (الإسناد التلقائي) مرّة إلى المخبّأ لاستخدامها في
  // المسار الحرِج (إنشاء الطلب) بلا استعلام في كل مرّة.
  await settingsService.preload();

  // 2) إنشاء خادم HTTP يلفّ تطبيق Express
  const server = http.createServer(app);

  // 3) تركيب Socket.io على نفس الخادم
  const io = new Server(server, {
    cors: { origin: env.corsOrigin, methods: ['GET', 'POST', 'PATCH'] },
  });
  registerSocketHandlers(io); // تسجيل معالجات الأحداث اللحظية

  // 4) تشغيل مُشغّل الطلبات المجدولة (يفعّل المستحقّ دوريًا)
  startScheduler({ intervalMs: 60_000 });

  // فحص حالة إشعارات FCM عند الإقلاع (Card 22): يطبع ✅ إن كان المفتاح صالحًا،
  // أو تحذيرًا إن كان مفقودًا/غير صالح — لتأكيد ضبط FCM_CREDENTIALS_JSON دون
  // انتظار أوّل إرسال (الذي يتوقّف مبكّرًا إن لم توجد رموز أجهزة مسجّلة بعد).
  notifications.isEnabled();

  // 5) بدء الاستماع
  server.listen(env.port, () => {
    logger.info(`🚀 Yalla API يعمل على المنفذ ${env.port} (${env.nodeEnv})`);
  });
}

bootstrap().catch((err) => {
  logger.error('فشل إقلاع الخادم:', err.message);
  process.exit(1);
});
