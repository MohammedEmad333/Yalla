'use strict';

// تحميل متغيّرات البيئة من ملف .env ثم تجميعها في كائن واحد.
// نلفّ الاستدعاء بحماية حتى تعمل أدوات مثل الاختبارات دون تثبيت التبعيات.
try {
  require('dotenv').config();
} catch {
  // dotenv غير مثبّت — نعتمد على متغيّرات البيئة الموجودة مباشرةً
}

// أصول تطبيقات Capacitor الأصليّة (نسخة أندرويد من لوحة الأدمن — Card 103/105).
// WebView في Capacitor يرسل الطلبات من أصل ثابت لا يتغيّر: مع androidScheme:"https"
// يكون الأصل https://localhost، وعلى iOS capacitor://localhost. نسمح بها دائمًا حتى
// يعمل تطبيق الأندرويد دون الحاجة لإضافة أصله يدويًا في CORS_ORIGIN بكلّ نشر/بناء.
const CAPACITOR_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost'];

// يقبل CORS_ORIGIN رابطًا واحدًا أو عدّة روابط مفصولة بفاصلة، مثل:
//   CORS_ORIGIN=https://gazalook-admin.netlify.app,https://yalla.workers.dev
// القيمة "*" تسمح لأي نطاق. نُرجع "*" أو مصفوفة أصول — وكلاهما مدعوم من حزمة
// cors ومن Socket.io. نُلحق دائمًا أصول Capacitor حتى تعمل نسخة الأندرويد.
function parseCorsOrigin(value) {
  // غياب القيمة أو "*" يعني السماح للجميع (يشمل Capacitor أصلًا) — نُبقيه كما كان.
  if (!value || value.trim() === '*') return '*';
  const list = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  // ندمج الأصول المضبوطة مع أصول Capacitor بلا تكرار حتى تعمل نسخة الأندرويد دائمًا
  return [...new Set([...list, ...CAPACITOR_ORIGINS])];
}

const env = {
  port: parseInt(process.env.PORT, 10) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/yalla',
  jwtSecret: process.env.JWT_SECRET || 'change_me_super_secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigin: parseCorsOrigin(process.env.CORS_ORIGIN),
  // تفعيل الإسناد التلقائي لأقرب كابتن عند إنشاء الطلب
  autoAssign: process.env.AUTO_ASSIGN === 'true',
  // نسبة عمولة الشركة من قيمة كل توصيلة (0.2 = 20%)
  commissionRate: parseFloat(process.env.COMMISSION_RATE) || 0.2,
  // مهلة قبول الكابتن للطلب المُسنَد قبل إلغاء الإسناد وإعادته (ثوانٍ) — ٣ دقائق (Card 54)
  acceptTimeoutSeconds: parseInt(process.env.ACCEPT_TIMEOUT_SECONDS, 10) || 180,
  // إعدادات إشعارات Firebase (اختيارية — إن غابت تُعطَّل الإشعارات).
  // على الاستضافة (Render وغيرها) الأسهل وضع محتوى مفتاح الخدمة كاملًا في
  // متغيّر FCM_CREDENTIALS_JSON؛ محليًّا يمكن استخدام مسار ملف FCM_CREDENTIALS_PATH.
  fcm: {
    credentialsPath: process.env.FCM_CREDENTIALS_PATH || '',
    credentialsJson: process.env.FCM_CREDENTIALS_JSON || '',
  },
};

module.exports = env;
// مكشوفة للاختبار فقط (منطق نقيّ لدمج أصول CORS)
module.exports.parseCorsOrigin = parseCorsOrigin;
module.exports.CAPACITOR_ORIGINS = CAPACITOR_ORIGINS;
