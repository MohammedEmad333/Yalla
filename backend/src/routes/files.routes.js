'use strict';

// توافق روابط الصور القديمة /files/<id>.
// بعد الهجرة التدريجية تبقى نفس الروابط، لكن جسم الصورة يُقرأ من قرص Oracle.
// إن لم تُهاجَر الصورة بعد نرجع تلقائيًا إلى binary القديم في MongoDB.
const fs = require('fs');
const router = require('express').Router();
const mongoose = require('mongoose');
const FileAsset = require('../models/FileAsset');
const { toBuffer } = require('../utils/toBuffer');
const { absoluteMediaPath } = require('../utils/mediaStorage');

function setAssetHeaders(res, id, asset, size) {
  const etag = `"file-${id}-${size}"`;
  res.set('Content-Type', asset.contentType || 'application/octet-stream');
  res.set('Content-Length', String(size));
  res.set('ETag', etag);
  if (asset.updatedAt) res.set('Last-Modified', new Date(asset.updatedAt).toUTCString());
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('CDN-Cache-Control', 'public, max-age=31536000, immutable');
  return etag;
}

async function sendDiskAsset(req, res, next, id, asset) {
  if (!asset.storagePath) return false;

  const absolutePath = absoluteMediaPath(asset.storagePath);
  if (!absolutePath) return false;

  let stat;
  try {
    stat = await fs.promises.stat(absolutePath);
  } catch (err) {
    if (err.code === 'ENOENT') return false;
    throw err;
  }
  if (!stat.isFile()) return false;

  const etag = setAssetHeaders(res, id, asset, stat.size);
  if (req.get('If-None-Match') === etag) {
    res.removeHeader('Content-Length');
    res.status(304).end();
    return true;
  }

  if (req.method === 'HEAD') {
    res.end();
    return true;
  }

  const stream = fs.createReadStream(absolutePath);
  stream.on('error', next);
  stream.pipe(res);
  return true;
}

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ message: 'الملفّ غير موجود' });
    }

    // لا نجلب data الثقيل في الاستعلام الأول. الصور المهاجرة تحتاج metadata صغيرة فقط.
    const asset = await FileAsset.findById(id)
      .select('storagePath contentType size updatedAt')
      .lean();
    if (!asset) {
      return res.status(404).json({ message: 'الملفّ غير موجود' });
    }

    if (await sendDiskAsset(req, res, next, id, asset)) return;

    // fallback مؤقت للصور التي لم تُهاجَر بعد من MongoDB.
    const legacy = await FileAsset.findById(id)
      .select('data contentType size updatedAt')
      .lean();
    if (!legacy || !legacy.data) {
      return res.status(404).json({ message: 'الملفّ غير موجود' });
    }

    const body = toBuffer(legacy.data);
    if (!body || !body.length) {
      return res.status(404).json({ message: 'الملفّ غير موجود' });
    }

    const etag = setAssetHeaders(res, id, legacy, legacy.size || body.length);
    if (req.get('If-None-Match') === etag) {
      res.removeHeader('Content-Length');
      return res.status(304).end();
    }

    if (req.method === 'HEAD') return res.end();
    return res.end(body);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
