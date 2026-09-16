'use strict';

const service = require('../services/feature.service');
const branchMetrics = require('../services/merchantBranchMetrics.service');
const Restaurant = require('../models/Restaurant');

function handler(fn) {
  return async (req, res, next) => {
    try { res.json(await fn(req, res)); } catch (err) { next(err); }
  };
}

async function setMerchantOpen(req, res, next) {
  try {
    const ctx = await branchMetrics.context(req.auth.id, req.auth.restaurantId);
    const restaurant = await Restaurant.findByIdAndUpdate(
      ctx.restaurantId,
      { isOpen: !!req.body.isOpen },
      { new: true }
    );
    if (!restaurant) return res.status(404).json({ message: 'المتجر غير موجود' });
    res.json({ ok: true, isOpen: restaurant.isOpen, restaurant });
  } catch (err) { next(err); }
}

module.exports = {
  listAddresses: handler((req) => service.listAddresses(req.auth.id)),
  addAddress: handler((req) => service.addAddress(req.auth.id, req.body)),
  updateAddress: handler((req) => service.updateAddress(req.auth.id, req.params.addressId, req.body)),
  deleteAddress: handler((req) => service.deleteAddress(req.auth.id, req.params.addressId)),
  listFavorites: handler((req) => service.listFavorites(req.auth.id)),
  toggleFavorite: handler((req) => service.toggleFavorite(req.auth.id, req.params.restaurantId)),
  reorder: handler((req) => service.reorder(req.auth.id, req.params.orderId)),
  publicCoupons: handler((req) => service.publicCoupons(req.query.restaurantId)),
  validateCoupon: handler((req) => service.validateCoupon(req.body.code, Number(req.body.subtotal) || 0, req.body.restaurantId)),
  adminListCoupons: handler(() => service.adminListCoupons()),
  adminCreateCoupon: async (req, res, next) => { try { res.status(201).json(await service.adminCreateCoupon(req.body)); } catch (err) { next(err); } },
  adminUpdateCoupon: handler((req) => service.adminUpdateCoupon(req.params.id, req.body)),
  merchantAnalytics: handler((req) => branchMetrics.analytics(req.auth.id, req.auth.restaurantId)),
  merchantFinance: handler((req) => branchMetrics.finance(req.auth.id, req.auth.restaurantId)),
  requestMerchantSettlement: async (req, res, next) => { try { res.status(201).json(await branchMetrics.requestSettlement(req.auth.id, req.auth.restaurantId, req.body)); } catch (err) { next(err); } },
  setMerchantOpen,
  operationsAlerts: handler(() => service.operationsAlerts()),
  adminFinance: handler(() => service.adminFinance()),
  adminListSettlements: handler(() => service.adminListSettlements()),
  adminProcessSettlement: handler((req) => service.adminProcessSettlement(req.params.id, req.body.status, req.body.note)),
};
