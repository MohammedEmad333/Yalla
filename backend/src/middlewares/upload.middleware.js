'use strict';

const path = require('path');
const fs = require('fs');
const multer = require('multer');

// مجلّد حفظ إيصالات الشحن (يُخدَم إستاتيكيًّا عبر /uploads في app.js)
const RECEIPTS_DIR = path.join(__dirname, '..', '..', 'uploads', 'receipts');
fs.mkdirSync(RECEIPTS_DIR, { recursive: true });

// تخزين على القرص باسم فريد يحفظ امتداد الملفّ الأصلي
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, RECEIPTS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `receipt-${unique}${ext}`);
  },
});

// نقبل الصور فقط، بحدّ حجم معقول للإيصالات
const uploadReceipt = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpe?g|png|webp|heic|heif)$/.test(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error('يُسمح برفع الصور فقط'), { statusCode: 400 }));
  },
});

// المسار العام الذي يُخدَم منه الملفّ المرفوع (لتخزينه في قاعدة البيانات)
function publicUrlFor(filename) {
  return filename ? `/uploads/receipts/${filename}` : '';
}

module.exports = { uploadReceipt, publicUrlFor, RECEIPTS_DIR };
