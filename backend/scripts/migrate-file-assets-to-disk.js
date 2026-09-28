'use strict';

// ينقل FileAsset القديمة من MongoDB إلى قرص Oracle على دفعات من دون تغيير روابطها.
// الاستخدام داخل حاوية الإنتاج:
//   npm run migrate:media -- --limit=100
// كرّر الأمر حتى تظهر migrated=0.
// استخدم --dry-run للعد فقط، أو --keep-data لنسخ الملفات مع إبقاء binary مؤقتًا في Mongo.

const fs = require('fs');
const mongoose = require('mongoose');
const env = require('../src/config/env');
const FileAsset = require('../src/models/FileAsset');
const { toBuffer } = require('../src/utils/toBuffer');
const {
  legacyRelativePath,
  writeMediaBuffer,
  absoluteMediaPath,
  getMediaRoot,
} = require('../src/utils/mediaStorage');

function argValue(name, fallback = '') {
  const prefix = `--${name}=`;
  const arg = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

async function run() {
  const limit = Math.min(5000, Math.max(1, parseInt(argValue('limit', '100'), 10) || 100));
  const dryRun = hasFlag('dry-run');
  const keepData = hasFlag('keep-data');

  await mongoose.connect(env.mongoUri);

  const remaining = await FileAsset.countDocuments({ data: { $exists: true, $ne: null } });
  console.log(`MEDIA_ROOT: ${getMediaRoot()}`);
  console.log(`Legacy FileAsset remaining: ${remaining}`);

  if (dryRun) {
    console.log('Dry run only; no files were changed.');
    await mongoose.disconnect();
    return;
  }

  const assets = await FileAsset.find({ data: { $exists: true, $ne: null } })
    .select('+data storagePath contentType size')
    .sort({ _id: 1 })
    .limit(limit)
    .lean();

  let migrated = 0;
  let skipped = 0;
  let bytes = 0;

  for (const asset of assets) {
    const body = toBuffer(asset.data);
    if (!body || !body.length) {
      console.warn(`skip ${asset._id}: empty/unreadable data`);
      skipped += 1;
      continue;
    }

    const relativePath =
      asset.storagePath || legacyRelativePath(asset._id, asset.contentType || 'application/octet-stream');

    await writeMediaBuffer(relativePath, body);

    const absolutePath = absoluteMediaPath(relativePath);
    const stat = await fs.promises.stat(absolutePath);
    if (!stat.isFile() || stat.size !== body.length) {
      throw new Error(`Verification failed for ${asset._id}: expected ${body.length}, got ${stat.size}`);
    }

    const update = {
      $set: {
        storagePath: relativePath,
        size: body.length,
      },
    };
    if (!keepData) update.$unset = { data: 1 };

    await FileAsset.updateOne({ _id: asset._id }, update);

    migrated += 1;
    bytes += body.length;
    console.log(`✓ ${asset._id} -> ${relativePath} (${body.length} bytes)`);
  }

  const left = keepData
    ? remaining
    : await FileAsset.countDocuments({ data: { $exists: true, $ne: null } });

  console.log(
    JSON.stringify(
      {
        migrated,
        skipped,
        bytes,
        remaining: left,
        keepData,
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('Media migration failed:', err);
  try {
    await mongoose.disconnect();
  } catch (_) {
    // ignore disconnect errors during failure handling
  }
  process.exit(1);
});
