'use strict';

// الصور الجديدة تُخزَّن كملفات دائمة على قرص Oracle بدل وضع الـ binary داخل MongoDB.
// تبقى روابط /files/<ObjectId> القديمة مدعومة أثناء الهجرة التدريجية.
const FileAsset = require('../models/FileAsset');
const { FILE_URL_RE, fileIdFromUrl } = require('./avatarUrl');
const { saveMediaFile, deleteMediaFileByUrl } = require('./mediaStorage');

// يحفظ صورة جديدة على التخزين الدائم ويرجع رابطًا ثابتًا وفريدًا من /media/... .
// أسماء الملفات لا تُعاد استخدامها، لذلك يمكن تخزينها في المتصفح/Cloudflare لمدة طويلة.
async function saveImage(file, { kind = 'image' } = {}) {
  const stored = await saveMediaFile(file, { kind });
  return stored.url;
}

// يحفظ صورة شخصية (توافقيّة مع النداءات القديمة) — نوعها avatar.
async function saveAvatar(file, opts = {}) {
  return saveImage(file, { ...opts, kind: 'avatar' });
}

// يحذف الصور الجديدة من القرص. وإن كان الرابط قديمًا من /files/<id>
// نحذف FileAsset من MongoDB؛ ملفّه المهاجر على القرص يُنظَّف بواسطة route/storage metadata.
async function deleteFileByUrl(url) {
  if (await deleteMediaFileByUrl(url)) return;

  const id = fileIdFromUrl(url);
  if (id) {
    const asset = await FileAsset.findByIdAndDelete(id).catch(() => null);
    if (asset?.storagePath) {
      // نعيد استخدام دالة الحذف الآمنة بتحويل storagePath إلى رابط /media مؤقت.
      await deleteMediaFileByUrl(`/media/${asset.storagePath}`).catch(() => {});
    }
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
