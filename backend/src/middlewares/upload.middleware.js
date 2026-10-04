'use strict';

const path = require('path');
const fs = require('fs');
const multer = require('multer');

// مجلّدات الرفع (الهوية والإيصالات خاصة ولا تُخدَم static)
const RECEIPTS_DIR = path.join(__dirname, '..', '..', 'uploads', 'receipts');
const AVATARS_DIR = path.join(__dirname, '..', '..', 'uploads', 'avatars');
const IDS_DIR = path.join(__dirname, '..', '..', 'uploads', 'ids');
fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
fs.mkdirSync(AVATARS_DIR, { recursive: true });
fs.mkdirSync(IDS_DIR, { recursive: true });

const IMAGE_MIME = /^image\/(jpe?g|png|webp|heic|heif)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;
function imageFileFilter(req, file, cb) {
  // لا نقبل الامتداد وحده: يجب أن يصرّح العميل بنوع صورة صالح، باستثناء
  // application/octet-stream المستخدم من بعض عملاء Flutter حيث نطلب امتدادًا صالحًا.
  const mimeOk = IMAGE_MIME.test(String(file.mimetype || ''));
  const flutterOctetStream = String(file.mimetype || '').toLowerCase() === 'application/octet-stream';
  const extOk = IMAGE_EXT.test(String(file.originalname || ''));
  const ok = mimeOk || (flutterOctetStream && extOk);
  if (ok) return cb(null, true);
  cb(Object.assign(new Error('يُسمح برفع الصور فقط'), { statusCode: 400 }));
}

function makeImageUploader(dir, prefix) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      // لا نعيد استخدام اسم العميل؛ نأخذ فقط امتدادًا مسموحًا وننشئ اسمًا عشوائيًا قويًا.
      const originalExt = path.extname(file.originalname || '').toLowerCase();
      const ext = IMAGE_EXT.test(originalExt) ? originalExt : '.jpg';
      const unique = require('node:crypto').randomBytes(18).toString('hex');
      cb(null, `${prefix}-${unique}${ext}`);
    },
  });
  return multer({
    storage,
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 2,
      fields: 16,
      parts: 20,
      fieldSize: 64 * 1024,
    },
    fileFilter: imageFileFilter,
  });
}

const uploadReceipt = multer({
  storage: makeImageUploader(RECEIPTS_DIR, 'receipt').storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 12, parts: 14, fieldSize: 64 * 1024 },
  fileFilter: imageFileFilter,
});

const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 8, parts: 10 },
  fileFilter: imageFileFilter,
});
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 8, parts: 10 },
  fileFilter: imageFileFilter,
});
const uploadCaptainDocs = makeImageUploader(IDS_DIR, 'id').fields([
  { name: 'idPhoto', maxCount: 1 },
  { name: 'selfie', maxCount: 1 },
]);

// تُخزّن مسارات نسبية فقط. تقديمها للمستخدم النهائي يتم وفق صلاحيات الخادم.
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
  uploadImage,
  uploadCaptainDocs,
  publicUrlFor,
  avatarUrlFor,
  idDocUrlFor,
  RECEIPTS_DIR,
  AVATARS_DIR,
  IDS_DIR,
};
