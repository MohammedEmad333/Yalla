'use strict';

// سكربت لإنشاء أوّل حساب أدمن (تشغيل لمرّة واحدة عند تجهيز النظام).
// الاستخدام:
//   node scripts/seed-admin.js "المدير" 0100000000 "StrongPass123"

const mongoose = require('mongoose');
const env = require('../src/config/env');
const User = require('../src/models/User');
const { ROLES } = require('../src/utils/constants');

async function run() {
  const [name = 'Admin', phone = '0100000000', password = 'Admin@12345'] = process.argv.slice(2);

  await mongoose.connect(env.mongoUri);

  // نتجنّب إنشاء أدمن مكرّر بنفس الهاتف
  const exists = await User.findOne({ phone });
  if (exists) {
    console.log(`⚠️  يوجد حساب بالفعل بهذا الهاتف: ${phone}`);
    return mongoose.disconnect();
  }

  const admin = new User({ name, phone, role: ROLES.ADMIN });
  await admin.setPassword(password);
  await admin.save();

  console.log('✅ تم إنشاء الأدمن:', { name, phone, role: admin.role });
  console.log('   كلمة المرور:', password, '(غيّرها لاحقًا)');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('❌ فشل إنشاء الأدمن:', err.message);
  process.exit(1);
});
