'use strict';

const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

// الاتصال بقاعدة بيانات MongoDB مرة واحدة عند إقلاع الخادم
async function connectDB() {
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(env.mongoUri);
    logger.info('✅ MongoDB متصل بنجاح');
  } catch (err) {
    logger.error('❌ فشل الاتصال بـ MongoDB', err.message);
    process.exit(1); // إيقاف الخادم إذا فشل الاتصال بالقاعدة
  }
}

module.exports = connectDB;
