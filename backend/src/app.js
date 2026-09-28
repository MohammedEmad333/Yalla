'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const routes = require('./routes');
const { rateLimit } = require('./middlewares/rateLimit.middleware');
const { notFound, errorHandler } = require('./middlewares/error.middleware');
const { getMediaRoot } = require('./utils/mediaStorage');

// إنشاء تطبيق Express (طبقة الـ HTTP فقط — منفصلة عن الخادم والسوكت)
const app = express();

// نثق فقط ببروكسي محلي (Caddy أو cloudflared على نفس الخادم).
// استخدام رقم ثابت مثل 1 يسمح لاتصال مباشر بالـ origin بتزوير X-Forwarded-For.
app.set('trust proxy', 'loopback');
// ترويسات أمان أساسية للـ API. TLS/HSTS يبقيان مسؤولية البروكسي الأمامي (Caddy/Cloudflare).
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(cors({ origin: env.corsOrigin }));
app.use(express.json({ limit: '100kb' })); // تحليل JSON بحدّ حجم يمنع الحمولات الضخمة

// الصور أصول عامة تُعرض أيضًا من تطبيق الويب على app.yalladelivery.org.
// CanvasKit/متصفحات الويب قد تجلب الصورة عبر fetch من أصل الـ API المختلف؛
// لذلك نسمح صراحةً بالقراءة عبر origins ونعلن أن المورد قابل للمشاركة cross-origin.
function publicAssetHeaders(req, res, next) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}

// خدمة الملفّات المرفوعة إستاتيكيًّا (إيصالات شحن الرصيد — المرحلة 1)
app.use('/uploads', publicAssetHeaders, express.static(path.join(__dirname, '..', 'uploads')));

// الصور الجديدة تُخدَم مباشرةً من قرص Oracle. الاسم فريد ولا يُعاد استخدامه، لذلك
// التخزين سنة كاملة آمن، وCloudflare يستطيع تقديمها من الـ edge بعد أول طلب.
app.use(
  '/media',
  publicAssetHeaders,
  express.static(getMediaRoot(), {
    maxAge: '1y',
    immutable: true,
    setHeaders(res) {
      res.set('Cache-Control', 'public, max-age=31536000, immutable');
      res.set('CDN-Cache-Control', 'public, max-age=31536000, immutable');
    },
  })
);

// توافق الصور القديمة: /files/<id> يبقى صالحًا أثناء نقل FileAsset من MongoDB إلى القرص.
app.use('/files', publicAssetHeaders, require('./routes/files.routes'));

// حدّ معدّل عام سخيّ لكل الـ API (طبقة حماية أساسية ضدّ الإساءة)
app.use('/api', rateLimit({ windowMs: 60_000, max: 300 }));
app.use('/api', routes);                 // كل الـ API تحت البادئة /api

// معالجة 404 ثم الأخطاء المركزية (يجب أن تكونا في النهاية)
app.use(notFound);
app.use(errorHandler);

module.exports = app;
