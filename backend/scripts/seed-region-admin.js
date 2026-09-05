'use strict';

// Card 110: إنشاء حساب أدمن مقيّد بنطاق مناطق (مدن) معيّنة — يرى فقط الطلبات
// التي تقع مدينة استلامها أو تسليمها ضمن نطاقه. مثال «أدمن الوسطى والجنوب»:
// الوسطى + خانيونس + رفح.
//
// الاستخدام:
//   node scripts/seed-region-admin.js "أدمن الوسطى والجنوب" 0101111111 "StrongPass123"
//   node scripts/seed-region-admin.js "اسم" هاتف كلمة_السر "الوسطى,خانيونس,رفح"
//
// إن لم تُمرَّر المناطق، تُستخدم الوسطى والجنوب افتراضيًا. إن وُجد حساب بنفس
// الهاتف مسبقًا يُحدَّث نطاق مناطقه (regions) فقط.

const mongoose = require('mongoose');
const env = require('../src/config/env');
const User = require('../src/models/User');
const { ROLES } = require('../src/utils/constants');
const { isValidCity, listCities } = require('../src/utils/neighborhoods');

// نطاق «الوسطى والجنوب» الافتراضي (الجنوب = خانيونس + رفح)
const DEFAULT_REGIONS = ['الوسطى', 'خانيونس', 'رفح'];

async function run() {
  const [
    name = 'أدمن الوسطى والجنوب',
    phone = '0101111111',
    password = 'Admin@12345',
    regionsArg = '',
  ] = process.argv.slice(2);

  // نحلّل المناطق من الوسيط (مفصولة بفاصلة) أو نستخدم الافتراضي، ونتحقّق من صحّتها
  const regions = (regionsArg
    ? regionsArg.split(',').map((r) => r.trim()).filter(Boolean)
    : DEFAULT_REGIONS
  ).filter((r) => {
    const ok = isValidCity(r);
    if (!ok) console.warn(`⚠️  مدينة غير معروفة سيُتجاهَل: ${r} (المدن المتاحة: ${listCities().join('، ')})`);
    return ok;
  });

  if (regions.length === 0) {
    console.error('❌ لا توجد مدن صالحة في النطاق — أوقِف الإنشاء.');
    process.exit(1);
  }

  await mongoose.connect(env.mongoUri);

  const existing = await User.findOne({ phone });
  if (existing) {
    existing.role = ROLES.ADMIN;
    existing.regions = regions;
    await existing.save();
    console.log('✅ حُدِّث نطاق مناطق الأدمن الموجود:', { phone, regions });
    return mongoose.disconnect();
  }

  const admin = new User({ name, phone, role: ROLES.ADMIN, regions });
  await admin.setPassword(password);
  await admin.save();

  console.log('✅ تم إنشاء أدمن المناطق:', { name, phone, role: admin.role, regions });
  console.log('   كلمة المرور:', password, '(غيّرها لاحقًا)');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('❌ فشل إنشاء أدمن المناطق:', err.message);
  process.exit(1);
});
