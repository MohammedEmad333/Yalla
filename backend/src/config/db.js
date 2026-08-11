'use strict';

const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

// الاتصال بقاعدة بيانات MongoDB مع إعادة المحاولة حتى جاهزيتها.
// (مفيد في Docker حيث قد يبدأ الـ API قبل أن تكون القاعدة جاهزة.)
async function connectDB(retries = 15, delayMs = 3000) {
  mongoose.set('strictQuery', true);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(env.mongoUri);
      logger.info('✅ MongoDB متصل بنجاح');
      return;
    } catch (err) {
      logger.warn(`⏳ محاولة الاتصال بـ MongoDB ${attempt}/${retries} فشلت: ${err.message}`);
      if (attempt === retries) {
        logger.error('❌ تعذّر الاتصال بـ MongoDB بعد عدّة محاولات');
        process.exit(1); // نستسلم بعد استنفاد المحاولات
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

module.exports = connectDB;
