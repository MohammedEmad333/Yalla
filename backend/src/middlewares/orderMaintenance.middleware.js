' strict';

const systemConfig = require('../services/systemConfig.service');

async function blockOrderCreationDuringMaintenance(req, res, next) {
  try {
    const state = await systemConfig.getOrderMaintenance();
    if (!state.enabled) return next();
    return res.status(503).json({
      message: state.message,
      code: 'ORDER_MAINTENANCE',
      orderMaintenance: state,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { blockOrderCreationDuringMaintenance };
