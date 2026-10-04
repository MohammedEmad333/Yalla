'use strict';

const User = require('../models/User');
const { ROLES } = require('../utils/constants');
const logger = require('../utils/logger');

async function migrateLegacyAdminRoles() {
  const result = await User.updateMany(
    {
      role: ROLES.ADMIN,
      $or: [
        { adminRole: null },
        { adminRole: { $exists: false } },
      ],
    },
    { $set: { adminRole: 'super_admin' } }
  );

  const modified = Number(result.modifiedCount || 0);
  if (modified > 0) {
    logger.warn(`🔐 تم تثبيت دور super_admin صراحةً لـ ${modified} حساب/حسابات إدارة قديمة`);
  }
  return modified;
}

module.exports = { migrateLegacyAdminRoles };
