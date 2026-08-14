'use strict';

// عدّة تهيئة لاختبارات التكامل.
// تحاول الاتصال بقاعدة بيانات حقيقية بالترتيب:
//   1) متغيّر البيئة TEST_MONGO_URI (مثلًا مونجو عبر docker في CI)
//   2) mongodb-memory-server (تنزّل نسخة مونجو مؤقتة)
// إن تعذّر الاثنان (بيئة بلا شبكة/مونجو) نضبط dbReady=false فتتخطّى
// الاختبارات نفسها بدل أن تفشل — حتى يبقى `npm test` أخضر في أي بيئة.

const mongoose = require('mongoose');
const ioRef = require('../../src/sockets/io');

let mongod = null;
const state = { dbReady: false };

// io وهمي قابل للتسلسل (to().to().emit()) حتى لا تفشل طبقة الخدمة
// التي تبثّ الأحداث، دون الحاجة لخادم Socket.io حقيقي في الاختبارات.
const stubIo = {
  to() { return this; },
  emit() { return this; },
};

async function connect() {
  ioRef.set(stubIo); // إتاحة io للطبقات قبل تشغيل أي خدمة

  try {
    let uri = process.env.TEST_MONGO_URI;
    if (!uri) {
      // تحميل كسول حتى لا تكون التبعية مطلوبة عند تخطّي التكامل
      // eslint-disable-next-line global-require
      const { MongoMemoryServer } = require('mongodb-memory-server');
      mongod = await MongoMemoryServer.create();
      uri = mongod.getUri();
    }
    // مُشغّل node --test يشغّل ملفّات الاختبار بالتوازي في عمليات منفصلة، وقد
    // تتشارك جميعها نفس TEST_MONGO_URI في CI. لذا نعزل كل عملية في قاعدة بيانات
    // خاصّة بها (اسم فريد لكل عملية) حتى لا يمسح clearDb لملفٍّ بيانات ملفٍّ آخر.
    const dbName = `yalla_test_${process.pid}_${Date.now()}`;
    await mongoose.connect(uri, { dbName });
    state.dbReady = true;
  } catch (err) {
    // بيئة بلا قاعدة بيانات — نتخطّى اختبارات التكامل بهدوء
    // eslint-disable-next-line no-console
    console.warn('⚠️  اختبارات التكامل مُتخطّاة (لا قاعدة بيانات):', err.message.split('\n')[0]);
    state.dbReady = false;
  }
}

async function disconnect() {
  // نُسقط قاعدة البيانات المؤقّتة الخاصّة بهذه العملية حتى لا تتراكم في CI
  if (state.dbReady) await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect().catch(() => {});
  if (mongod) await mongod.stop();
}

// تنظيف كل المجموعات بين الاختبارات لعزلها عن بعضها
async function clearDb() {
  if (!state.dbReady) return;
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

module.exports = { connect, disconnect, clearDb, state };
