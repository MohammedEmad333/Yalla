'use strict';

const http = require('http');
const { Server } = require('socket.io');

const env = require('./config/env');
const app = require('./app');
const connectDB = require('./config/db');
const registerSocketHandlers = require('./sockets/order.socket');
const logger = require('./utils/logger');

// نقطة الإقلاع: نربط Express + Socket.io على خادم HTTP واحد
async function bootstrap() {
  await connectDB(); // 1) الاتصال بقاعدة البيانات

  // 2) إنشاء خادم HTTP يلفّ تطبيق Express
  const server = http.createServer(app);

  // 3) تركيب Socket.io على نفس الخادم
  const io = new Server(server, {
    cors: { origin: env.corsOrigin, methods: ['GET', 'POST', 'PATCH'] },
  });
  registerSocketHandlers(io); // تسجيل معالجات الأحداث اللحظية

  // 4) بدء الاستماع
  server.listen(env.port, () => {
    logger.info(`🚀 Yalla API يعمل على المنفذ ${env.port} (${env.nodeEnv})`);
  });
}

bootstrap().catch((err) => {
  logger.error('فشل إقلاع الخادم:', err.message);
  process.exit(1);
});
