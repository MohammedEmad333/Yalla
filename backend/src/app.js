'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const routes = require('./routes');
const { rateLimit } = require('./middlewares/rateLimit.middleware');
const { notFound, errorHandler } = require('./middlewares/error.middleware');

// إنشاء تطبيق Express (طبقة الـ HTTP فقط — منفصلة عن الخادم والسوكت)
const app = express();

app.set('trust proxy', 1);               // نثق ببروكسي واحد أمامنا لقراءة req.ip الحقيقي
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

// Card 102: خدمة الصور المخزّنة في قاعدة البيانات (دائمة، لا تُمحى عند إعادة التشغيل)
app.use('/files', publicAssetHeaders, require('./routes/files.routes'));

// حدّ معدّل عام سخيّ لكل الـ API (طبقة حماية أساسية ضدّ الإساءة)
app.use('/api', rateLimit({ windowMs: 60_000, max: 300 }));
app.use('/api', routes);                 // كل الـ API تحت البادئة /api

// معالجة 404 ثم الأخطاء المركزية (يجب أن تكونا في النهاية)
app.use(notFound);
app.use(errorHandler);

module.exports = app;
