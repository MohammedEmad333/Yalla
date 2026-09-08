'use strict';

// Card 102: تخزين الصور الشخصية في قاعدة البيانات (دائم) بدل القرص المؤقّت
// للاستضافة المجانية الذي يُمحى عند إعادة التشغيل. يوفّر هذا الموديل حفظ
// صورة جديدة (من buffer في الذاكرة) وحذف الصورة القديمة إن كانت مخزّنة عندنا.
const FileAsset = require('../models/FileAsset');
const { FILE_URL_RE, fileIdFromUrl } = require('./avatarUrl');

// يحفظ صورة (file من multer.memoryStorage) في قاعدة البيانات ويُرجع رابطها
// الثابت /files/<id>. الوسيط kind يميّز نوع الأصل (avatar / restaurant / menu-item)
// ليبقى التخزين موحّدًا لكلّ الصور مع إمكانية التنظيف حسب النوع لاحقًا.
async function saveImage(file, { kind = 'image', owner, ownerRole } = {}) {
  const asset = await FileAsset.create({
    kind,
    data: file.buffer,
    contentType: file.mimetype || 'image/jpeg',
    size: file.size || (file.buffer ? file.buffer.length : 0),
    owner,
    ownerRole,
  });
  return `/files/${asset._id}`;
}

// يحفظ صورة شخصية (توافقيّة مع النداءات القديمة) — نوعها avatar.
async function saveAvatar(file, opts = {}) {
  return saveImage(file, { ...opts, kind: 'avatar' });
}

// يحذف صورة من قاعدة البيانات إن كان رابطها يشير إلى /files/<id> (لأيّ نوع).
async function deleteFileByUrl(url) {
  const id = fileIdFromUrl(url);
  if (id) {
    await FileAsset.findByIdAndDelete(id).catch(() => {});
  }
}

module.exports = {
  saveImage,
  saveAvatar,
  deleteFileByUrl,
  // اسم قديم متوافق مع النداءات الحاليّة (auth/admin controllers)
  deleteAvatarByUrl: deleteFileByUrl,
  FILE_URL_RE,
};
