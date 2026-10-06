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
const { migrateLegacyAdminRoles } = require('./services/securityMigration.service');
const {
  ADMIN_SESSION_SENTINEL,
  getAdminSessionTokenFromCookieHeader,
} = require('./utils/adminSession');
const logger = require('./utils/logger');

// نقطة الإقلاع: نربط Express + Socket.io على خادم HTTP واحد
async function bootstrap() {
  await connectDB(); // 1) الاتصال بقاعدة البيانات

  // تثبيت صلاحيات حسابات الإدارة القديمة صراحةً قبل تشغيل أي endpoint إداري.
  // الحسابات التي كانت adminRole=null كانت تُعامل سابقًا كـ super_admin؛ نحفظ
  // نفس السلوك في البيانات مرة واحدة ثم يصبح نظام الصلاحيات fail-closed.
  await migrateLegacyAdminRoles();

  // تحميل إعدادات المنظومة (الإسناد التلقائي) مرّة إلى المخبّأ لاستخدامها في
  // المسار الحرِج (إنشاء الطلب) بلا استعلام في كل مرّة.
  await settingsService.preload();

  // 2) إنشاء خادم HTTP يلفّ تطبيق Express
  const server = http.createServer(app);

  // 3) تركيب Socket.io على نفس الخادم
  const io = new Server(server, {
    cors: {
      origin: env.corsOrigin,
      methods: ['GET', 'POST', 'PATCH'],
      credentials: true,
    },
  });

  // Admin Web لا يستطيع قراءة HttpOnly cookie — وهذا مقصود. قبل معالج المصادقة
  // الحالي للسوكت ننسخ JWT من الكوكي إلى handshake.auth داخل الخادم فقط. تطبيقات
  // Capacitor تواصل إرسال Bearer JWT المعتاد دون أي تغيير.
  io.use((socket, next) => {
    const provided = socket.handshake.auth?.token;
    if (provided && provided !== ADMIN_SESSION_SENTINEL) return next();

    const cookieToken = getAdminSessionTokenFromCookieHeader(socket.handshake.headers.cookie);
    if (cookieToken) {
      socket.handshake.auth = {
        ...(socket.handshake.auth || {}),
        token: cookieToken,
      };
    }
    next();
  });

  registerSocketHandlers(io); // تسجيل معالجات الأحداث اللحظية

  // 4) تشغيل مُشغّل الطلبات المجدولة (يفعّل المستحقّ دوريًا)
  startScheduler({ intervalMs: 60_000 });

  // فحص حالة إشعارات FCM عند الإقلاع (Card 22): يطبع ✅ إن كان المفتاح صالحًا،
  // أو تحذيرًا إن كان مفقودًا/غير صالح — لتأكيد ضبط FCM_CREDENTIALS_JSON دون
  // انتظار أوّل إرسال (الذي يتوقّف مبكّرًا إن لم توجد رموز أجهزة مسجّلة بعد).
  notifications.isEnabled();

  // 5) بدء الاستماع
  server.listen(env.port, env.apiBindHost, () => {
    logger.info(`🚀 Yalla API يعمل على ${env.apiBindHost}:${env.port} (${env.nodeEnv})`);
  });
}

bootstrap().catch((err) => {
  logger.error('فشل إقلاع الخادم:', err.message);
  process.exit(1);
});
