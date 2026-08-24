'use strict';

const path = require('path');
const fs = require('fs');
const multer = require('multer');

// مجلّدات الرفع (تُخدَم إستاتيكيًّا عبر /uploads في app.js)
const RECEIPTS_DIR = path.join(__dirname, '..', '..', 'uploads', 'receipts');
const AVATARS_DIR = path.join(__dirname, '..', '..', 'uploads', 'avatars');
// Card 79: مستندات توثيق الكابتن (صورة الهوية + السيلفي) — منفصلة عن الصور العامّة
const IDS_DIR = path.join(__dirname, '..', '..', 'uploads', 'ids');
fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
fs.mkdirSync(AVATARS_DIR, { recursive: true });
fs.mkdirSync(IDS_DIR, { recursive: true });

// نقبل الصور فقط، بحدّ حجم معقول.
// نتحقّق عبر نوع المحتوى (mimetype) أو امتداد الملفّ — لأنّ بعض العملاء
// (مثل رفع Flutter) قد يرسلون الصورة بنوع application/octet-stream.
const IMAGE_MIME = /^image\/(jpe?g|png|webp|heic|heif)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;
function imageFileFilter(req, file, cb) {
  const ok = IMAGE_MIME.test(file.mimetype) || IMAGE_EXT.test(file.originalname || '');
  if (ok) return cb(null, true);
  cb(Object.assign(new Error('يُسمح برفع الصور فقط'), { statusCode: 400 }));
}

// مصنع رافع صور: يخزّن على القرص في مجلّد محدّد باسم فريد بادئته prefix.
function makeImageUploader(dir, prefix) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${prefix}-${unique}${ext}`);
    },
  });
  return multer({ storage, limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: imageFileFilter });
}

// رافع إيصالات الشحن (المحفظة) ورافع الصور الشخصية (Card 17)
const uploadReceipt = makeImageUploader(RECEIPTS_DIR, 'receipt');
const uploadAvatar = makeImageUploader(AVATARS_DIR, 'avatar');
// Card 79: رافع مستندات توثيق الكابتن — حقلان: idPhoto (الهوية) + selfie (سيلفي)
const uploadCaptainDocs = makeImageUploader(IDS_DIR, 'id').fields([
  { name: 'idPhoto', maxCount: 1 },
  { name: 'selfie', maxCount: 1 },
]);

// المسار العام الذي يُخدَم منه الملفّ المرفوع (لتخزينه في قاعدة البيانات)
function publicUrlFor(filename) {
  return filename ? `/uploads/receipts/${filename}` : '';
}
function avatarUrlFor(filename) {
  return filename ? `/uploads/avatars/${filename}` : '';
}
function idDocUrlFor(filename) {
  return filename ? `/uploads/ids/${filename}` : '';
}

module.exports = {
  uploadReceipt,
  uploadAvatar,
  uploadCaptainDocs,
  publicUrlFor,
  avatarUrlFor,
  idDocUrlFor,
  RECEIPTS_DIR,
  AVATARS_DIR,
  IDS_DIR,
};
