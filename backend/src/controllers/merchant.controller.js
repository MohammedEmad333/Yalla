'use strict';

const merchantService = require('../services/merchant.service');

const branchId = (req) => req.auth?.restaurantId || null;

async function profile(req, res, next) { try { res.json(await merchantService.getProfile(req.auth.id, branchId(req))); } catch (err) { next(err); } }
async function updateRestaurant(req, res, next) { try { res.json(await merchantService.updateRestaurant(req.auth.id, branchId(req), req.body)); } catch (err) { next(err); } }
async function uploadRestaurantImage(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'أرفق صورة' });
    const restaurant = await merchantService.setRestaurantImage(req.auth.id, branchId(req), req.file);
    res.json({ ok: true, imageUrl: restaurant.imageUrl, restaurant });
  } catch (err) { next(err); }
}
async function listMenu(req, res, next) { try { res.json(await merchantService.listMenu(req.auth.id, branchId(req))); } catch (err) { next(err); } }
async function createMenuItem(req, res, next) { try { res.status(201).json(await merchantService.createMenuItem(req.auth.id, branchId(req), req.body)); } catch (err) { next(err); } }
async function updateMenuItem(req, res, next) { try { res.json(await merchantService.updateMenuItem(req.auth.id, branchId(req), req.params.itemId, req.body)); } catch (err) { next(err); } }
async function deleteMenuItem(req, res, next) { try { res.json(await merchantService.deleteMenuItem(req.auth.id, branchId(req), req.params.itemId)); } catch (err) { next(err); } }
async function uploadMenuItemImage(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'أرفق صورة' });
    const item = await merchantService.setMenuItemImage(req.auth.id, branchId(req), req.params.itemId, req.file);
    res.json({ ok: true, imageUrl: item.imageUrl, item });
  } catch (err) { next(err); }
}
async function listOrders(req, res, next) { try { res.json(await merchantService.listOrders(req.auth.id, branchId(req), req.query)); } catch (err) { next(err); } }
async function updateOrderStatus(req, res, next) { try { res.json(await merchantService.updateOrderStatus(req.auth.id, branchId(req), req.params.orderId, req.body.status)); } catch (err) { next(err); } }
async function inventorySummary(req, res, next) { try { res.json(await merchantService.inventorySummary(req.auth.id, branchId(req))); } catch (err) { next(err); } }
async function adjustInventory(req, res, next) { try { res.json(await merchantService.adjustInventory(req.auth.id, branchId(req), req.params.itemId, req.body.delta)); } catch (err) { next(err); } }

module.exports = {
  profile, updateRestaurant, uploadRestaurantImage,
  listMenu, createMenuItem, updateMenuItem, deleteMenuItem, uploadMenuItemImage,
  inventorySummary, adjustInventory,
  listOrders, updateOrderStatus,
};
