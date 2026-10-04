'use strict';

// Card 110: إنشاء حساب أدمن مقيّد بنطاق مناطق (مدن) معيّنة — يرى فقط الطلبات
// التي تقع مدينة استلامها أو تسليمها ضمن نطاقه.
// الاستخدام:
//   node scripts/seed-region-admin.js "أدمن الوسطى والجنوب" 0101111111 "<strong-password>"
//   node scripts/seed-region-admin.js "اسم" هاتف كلمة_السر "الوسطى,خانيونس,رفح"

const mongoose = require('mongoose');
const env = require('../src/config/env');
const User = require('../src/models/User');
const { ROLES } = require('../src/utils/constants');
const { isValidCity, listCities } = require('../src/utils/neighborhoods');

const DEFAULT_REGIONS = ['الوسطى', 'خانيونس', 'رفح'];

async function run() {
  const [
    name = 'أدمن الوسطى والجنوب',
    phone = '',
    password = '',
    regionsArg = '',
  ] = process.argv.slice(2);

  if (!phone) throw new Error('رقم جوال الأدمن مطلوب');

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
    existing.adminRole = existing.adminRole || 'operations';
    existing.regions = regions;
    await existing.save();
    console.log('✅ حُدِّث نطاق مناطق الأدمن الموجود:', { phone, adminRole: existing.adminRole, regions });
    return mongoose.disconnect();
  }

  if (String(password).length < 10) throw new Error('كلمة مرور الأدمن يجب أن تكون 10 أحرف على الأقل');
  const admin = new User({ name, phone, role: ROLES.ADMIN, adminRole: 'operations', regions });
  await admin.setPassword(password);
  await admin.save();

  console.log('✅ تم إنشاء أدمن المناطق:', { name, phone, role: admin.role, adminRole: admin.adminRole, regions });
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('❌ فشل إنشاء أدمن المناطق:', err.message);
  process.exit(1);
});
