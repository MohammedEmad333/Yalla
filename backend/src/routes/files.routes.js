'use strict';

// Card 102: خدمة الصور المخزّنة في قاعدة البيانات (FileAsset).
// تُخدَم من المسار /files/<id> (خارج بادئة /api، تمامًا مثل /uploads القديم)
// حتى يبقى بناء رابط الصورة في التطبيق ولوحة الأدمن كما هو (host + avatarUrl).
const router = require('express').Router();
const mongoose = require('mongoose');
const FileAsset = require('../models/FileAsset');

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).json({ message: 'الملفّ غير موجود' });
    }
    const asset = await FileAsset.findById(id).lean();
    if (!asset || !asset.data) {
      return res.status(404).json({ message: 'الملفّ غير موجود' });
    }
    res.set('Content-Type', asset.contentType || 'application/octet-stream');
    // تخزين مؤقّت طويل على المتصفّح/التطبيق — الرابط ثابت لكلّ صورة (id فريد)
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(asset.data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
