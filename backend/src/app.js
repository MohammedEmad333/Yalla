'use strict';

const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middlewares/error.middleware');

// إنشاء تطبيق Express (طبقة الـ HTTP فقط — منفصلة عن الخادم والسوكت)
const app = express();

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());                 // تحليل جسم الطلبات JSON
app.use('/api', routes);                 // كل الـ API تحت البادئة /api

// معالجة 404 ثم الأخطاء المركزية (يجب أن تكونا في النهاية)
app.use(notFound);
app.use(errorHandler);

module.exports = app;
