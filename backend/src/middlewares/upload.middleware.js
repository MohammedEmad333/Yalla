'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('node:crypto');
const multer = require('multer');

// مجلّدات الرفع. الهوية والإيصالات خاصة ولا تُخدَم static.
const RECEIPTS_DIR = path.join(__dirname, '..', '..', 'uploads', 'receipts');
const AVATARS_DIR = path.join(__dirname, '..', '..', 'uploads', 'avatars');
const IDS_DIR = path.join(__dirname, '..', '..', 'uploads', 'ids');
fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
fs.mkdirSync(AVATARS_DIR, { recursive: true });
fs.mkdirSync(IDS_DIR, { recursive: true });

const IMAGE_MIME = /^image\/(jpe?g|png|webp|heic|heif)$/i;
const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif)$/i;
function imageFileFilter(req, file, cb) {
  const mimetype = String(file.mimetype || '').toLowerCase();
  const mimeOk = IMAGE_MIME.test(mimetype);
  const flutterOctetStream = mimetype === 'application/octet-stream';
  const extOk = IMAGE_EXT.test(String(file.originalname || ''));
  const ok = mimeOk || (flutterOctetStream && extOk);
  if (ok) return cb(null, true);
  cb(Object.assign(new Error('يُسمح برفع الصور فقط'), { statusCode: 400 }));
}

function diskStorage(dir, prefix) {
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const originalExt = path.extname(file.originalname || '').toLowerCase();
      const ext = IMAGE_EXT.test(originalExt) ? originalExt : '.jpg';
      const unique = crypto.randomBytes(18).toString('hex');
      cb(null, `${prefix}-${unique}${ext}`);
    },
  });
}

function makeDiskImageUploader(dir, prefix, { files = 2, fields = 16, parts = 20 } = {}) {
  return multer({
    storage: diskStorage(dir, prefix),
    limits: {
      fileSize: 5 * 1024 * 1024,
      files,
      fields,
      parts,
      fieldSize: 64 * 1024,
    },
    fileFilter: imageFileFilter,
  });
}

const uploadReceipt = makeDiskImageUploader(RECEIPTS_DIR, 'receipt', { files: 1, fields: 12, parts: 14 });
const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 8, parts: 10, fieldSize: 64 * 1024 },
  fileFilter: imageFileFilter,
});
const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 8, parts: 10, fieldSize: 64 * 1024 },
  fileFilter: imageFileFilter,
});
const uploadCaptainDocs = makeDiskImageUploader(IDS_DIR, 'id', { files: 2, fields: 16, parts: 20 }).fields([
  { name: 'idPhoto', maxCount: 1 },
  { name: 'selfie', maxCount: 1 },
]);

// تُخزّن مسارات نسبية فقط للتوافق مع البيانات الحالية.
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
