'use strict';

// سكربت لإنشاء أوّل حساب Super Admin (تشغيل لمرّة واحدة عند تجهيز النظام).
// الاستخدام:
//   node scripts/seed-admin.js "المدير" 0100000000 "<strong-password>"

const mongoose = require('mongoose');
const env = require('../src/config/env');
const User = require('../src/models/User');
const { ROLES } = require('../src/utils/constants');

async function run() {
  const [name = 'Admin', phone = '', password = ''] = process.argv.slice(2);
  if (!phone) throw new Error('رقم جوال الأدمن مطلوب');
  if (String(password).length < 10) throw new Error('كلمة مرور الأدمن يجب أن تكون 10 أحرف على الأقل');

  await mongoose.connect(env.mongoUri);

  const exists = await User.findOne({ phone });
  if (exists) {
    console.log(`⚠️  يوجد حساب بالفعل بهذا الهاتف: ${phone}`);
    return mongoose.disconnect();
  }

  const admin = new User({ name, phone, role: ROLES.ADMIN, adminRole: 'super_admin' });
  await admin.setPassword(password);
  await admin.save();

  console.log('✅ تم إنشاء Super Admin:', { name, phone, role: admin.role, adminRole: admin.adminRole });
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('❌ فشل إنشاء الأدمن:', err.message);
  process.exit(1);
});
