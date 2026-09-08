'use strict';

// سكربت تعبئة مطاعم تجريبية مع قوائمها (Card 110) — لتجربة صفحة المطاعم فورًا.
// الاستخدام:
//   node scripts/seed-restaurants.js
//   (داخل docker: docker compose exec api npm run seed:restaurants)
// آمن للتكرار: يتخطّى أي مطعم موجود بنفس الاسم.

const mongoose = require('mongoose');
const env = require('../src/config/env');
const Restaurant = require('../src/models/Restaurant');
const MenuItem = require('../src/models/MenuItem');
const { normalizeRestaurantPayload } = require('../src/services/restaurant.service');

// بيانات تجريبية: مطعم + قائمته
const DATA = [
  {
    name: 'مشاوي الفروج',
    description: 'مشاوي طازجة على الفحم — دجاج وكفتة وشيش طاووق',
    category: 'مشاوي',
    city: 'غزة',
    neighborhood: 'الرمال',
    phone: '0599111111',
    minOrder: 20,
    prepMinutes: 20,
    openTime: '11:00',
    closeTime: '23:00',
    menu: [
      { name: 'نصف فروج مشوي', price: 25, category: 'مشاوي', description: 'مع خبز وسلطة' },
      { name: 'شيش طاووق', price: 30, category: 'مشاوي' },
      { name: 'كفتة مشوية', price: 28, category: 'مشاوي' },
      { name: 'سلطة عربية', price: 6, category: 'مقبّلات' },
      { name: 'حمّص', price: 7, category: 'مقبّلات' },
      { name: 'كولا', price: 4, category: 'مشروبات' },
    ],
  },
  {
    name: 'شاورما الشام',
    description: 'شاورما عربي ولحمة على أصولها',
    category: 'شاورما',
    city: 'غزة',
    neighborhood: 'النصر',
    phone: '0599222222',
    minOrder: 10,
    prepMinutes: 10,
    menu: [
      { name: 'ساندويش شاورما دجاج', price: 10, category: 'ساندويشات' },
      { name: 'ساندويش شاورما لحمة', price: 14, category: 'ساندويشات' },
      { name: 'صحن شاورما', price: 25, category: 'وجبات' },
      { name: 'بطاطا مقلية', price: 6, category: 'إضافات' },
      { name: 'عصير ليمون بالنعناع', price: 6, category: 'مشروبات' },
    ],
  },
  {
    name: 'بيتزا يلا',
    description: 'بيتزا إيطالية بعجينة طازجة',
    category: 'بيتزا',
    city: 'غزة',
    neighborhood: 'تل الهوا',
    phone: '0599333333',
    minOrder: 15,
    prepMinutes: 25,
    menu: [
      { name: 'بيتزا مارغريتا', price: 20, category: 'بيتزا' },
      { name: 'بيتزا خضار', price: 22, category: 'بيتزا' },
      { name: 'بيتزا دجاج', price: 28, category: 'بيتزا' },
      { name: 'خبز بالثوم', price: 8, category: 'إضافات' },
      { name: 'كولا', price: 4, category: 'مشروبات' },
    ],
  },
  {
    name: 'حلويات السعادة',
    description: 'كنافة وبقلاوة وحلويات شرقية',
    category: 'حلويات',
    city: 'خانيونس',
    neighborhood: 'خانيونس البلد',
    phone: '0599444444',
    minOrder: 10,
    prepMinutes: 10,
    menu: [
      { name: 'كنافة نابلسية (كيلو)', price: 35, category: 'حلويات شرقية' },
      { name: 'بقلاوة (نصف كيلو)', price: 25, category: 'حلويات شرقية' },
      { name: 'مهلبية', price: 5, category: 'حلويات باردة' },
    ],
  },
  {
    name: 'كافيه المدينة',
    description: 'قهوة مختصّة ومشروبات ساخنة وباردة',
    category: 'كافيه',
    city: 'غزة',
    neighborhood: 'الرمال',
    phone: '0599555555',
    minOrder: 10,
    prepMinutes: 10,
    openTime: '08:00',
    closeTime: '23:30',
    menu: [
      { name: 'قهوة عربية', price: 6, category: 'مشروبات ساخنة' },
      { name: 'إسبريسو', price: 8, category: 'مشروبات ساخنة' },
      { name: 'كابتشينو', price: 12, category: 'مشروبات ساخنة' },
      { name: 'آيس كوفي', price: 14, category: 'مشروبات باردة' },
      { name: 'عصير برتقال طازج', price: 10, category: 'مشروبات باردة' },
      { name: 'تشيز كيك', price: 15, category: 'حلويات' },
    ],
  },
  {
    name: 'مخبز الحطب',
    description: 'خبز طازج ومعجّنات ومخبوزات على الحطب',
    category: 'مخبوزات',
    city: 'غزة',
    neighborhood: 'النصر',
    phone: '0599666666',
    minOrder: 5,
    prepMinutes: 15,
    openTime: '06:00',
    closeTime: '14:00',
    menu: [
      { name: 'خبز كماج (٥ أرغفة)', price: 5, category: 'خبز' },
      { name: 'صمون (٥ حبّات)', price: 6, category: 'خبز' },
      { name: 'فطيرة زعتر', price: 4, category: 'معجّنات' },
      { name: 'فطيرة جبنة', price: 6, category: 'معجّنات' },
      { name: 'كرواسون', price: 7, category: 'معجّنات' },
    ],
  },
];

async function run() {
  await mongoose.connect(env.mongoUri);

  let created = 0;
  for (const { menu, ...restaurant } of DATA) {
    const exists = await Restaurant.findOne({ name: restaurant.name });
    if (exists) {
      console.log(`⏭️  موجود مسبقًا: ${restaurant.name}`);
      continue;
    }
    const doc = await Restaurant.create(normalizeRestaurantPayload(restaurant));
    await MenuItem.insertMany(
      menu.map((item, i) => ({ ...item, restaurant: doc._id, sortOrder: i }))
    );
    created += 1;
    console.log(`✅ ${restaurant.name} — ${menu.length} صنفًا`);
  }

  console.log(`تمّ: ${created} مطعمًا جديدًا.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('❌ فشل تعبئة المطاعم:', err.message);
  process.exit(1);
});
