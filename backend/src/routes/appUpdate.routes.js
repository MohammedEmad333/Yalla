'use strict';

const router = require('express').Router();
const Settings = require('../models/Settings');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { requireAdminCapability } = require('../middlewares/adminAccess.middleware');
const { ROLES } = require('../utils/constants');

const VERSION_RE = /^\d+\.\d+\.\d+$/;

function shape(doc) {
  return {
    enabled: doc?.appUpdateEnabled !== false,
    latestVersion: doc?.latestAppVersion || '1.0.7',
    minimumVersion: doc?.minimumAppVersion || '1.0.6',
    forceUpdate: !!doc?.forceAppUpdate,
    title: doc?.appUpdateTitle || 'يتوفر إصدار جديد من Yalla',
    message: doc?.appUpdateMessage || 'حدّث الآن للحصول على أحدث التحسينات وأفضل تجربة استخدام.',
    androidStoreUrl: doc?.androidStoreUrl || 'https://play.google.com/store/apps/details?id=com.mohammedemad333.yalla',
  };
}

router.get('/', async (req, res, next) => {
  try {
    let doc = await Settings.findOne({ key: 'global' });
    if (!doc) doc = await Settings.create({ key: 'global' });
    res.json(shape(doc));
  } catch (err) { next(err); }
});

router.patch('/', authenticate, authorize(ROLES.ADMIN), requireAdminCapability('operations'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const update = {};
    if (body.latestVersion !== undefined) {
      const v = String(body.latestVersion).trim();
      if (!VERSION_RE.test(v)) return res.status(400).json({ message: 'صيغة أحدث إصدار يجب أن تكون مثل 1.0.7' });
      update.latestAppVersion = v;
    }
    if (body.minimumVersion !== undefined) {
      const v = String(body.minimumVersion).trim();
      if (!VERSION_RE.test(v)) return res.status(400).json({ message: 'صيغة أقل إصدار يجب أن تكون مثل 1.0.6' });
      update.minimumAppVersion = v;
    }
    if (typeof body.forceUpdate === 'boolean') update.forceAppUpdate = body.forceUpdate;
    if (typeof body.enabled === 'boolean') update.appUpdateEnabled = body.enabled;
    if (body.title !== undefined) update.appUpdateTitle = String(body.title).trim();
    if (body.message !== undefined) update.appUpdateMessage = String(body.message).trim();
    if (body.androidStoreUrl !== undefined) {
      const url = String(body.androidStoreUrl).trim();
      if (!/^https:\/\//i.test(url)) return res.status(400).json({ message: 'رابط المتجر يجب أن يبدأ بـ https://' });
      update.androidStoreUrl = url;
    }
    const doc = await Settings.findOneAndUpdate(
      { key: 'global' },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    res.json(shape(doc));
  } catch (err) { next(err); }
});

module.exports = router;
