'use strict';

const ROLE_RULES = {
  owner: () => true,
  manager: (capability) => ['profile','restaurant','menu','inventory','orders'].includes(capability),
  cashier: (capability) => ['profile','orders'].includes(capability),
};

function normalizedStaffRole(req) {
  return String(req.auth?.staffRole || 'owner').trim().toLowerCase();
}

function requireMerchantCapability(capability) {
  return (req, res, next) => {
    const role = normalizedStaffRole(req);
    if (ROLE_RULES[role]?.(capability) === true) return next();
    return res.status(403).json({
      message: 'ليس لديك صلاحية لهذا الإجراء في المتجر',
      staffRole: role,
      permission: capability,
    });
  };
}

module.exports = {
  requireMerchantCapability,
  ROLE_RULES,
  _test: { normalizedStaffRole },
};
