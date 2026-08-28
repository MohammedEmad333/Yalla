'use strict';

// Card 102: تخزين الصور الشخصية في قاعدة البيانات (دائم) بدل القرص المؤقّت
// للاستضافة المجانية الذي يُمحى عند إعادة التشغيل. يوفّر هذا الموديل حفظ
// صورة جديدة (من buffer في الذاكرة) وحذف الصورة القديمة إن كانت مخزّنة عندنا.
const FileAsset = require('../models/FileAsset');
const { FILE_URL_RE, fileIdFromUrl } = require('./avatarUrl');

// يحفظ صورة (file من multer.memoryStorage) ويُرجع رابطها الثابت /files/<id>
async function saveAvatar(file, { owner, ownerRole } = {}) {
  const asset = await FileAsset.create({
    kind: 'avatar',
    data: file.buffer,
    contentType: file.mimetype || 'image/jpeg',
    size: file.size || (file.buffer ? file.buffer.length : 0),
    owner,
    ownerRole,
  });
  return `/files/${asset._id}`;
}

// يحذف الصورة القديمة من قاعدة البيانات إن كان رابطها يشير إلى /files/<id>
async function deleteAvatarByUrl(url) {
  const id = fileIdFromUrl(url);
  if (id) {
    await FileAsset.findByIdAndDelete(id).catch(() => {});
  }
}

module.exports = { saveAvatar, deleteAvatarByUrl, FILE_URL_RE };
