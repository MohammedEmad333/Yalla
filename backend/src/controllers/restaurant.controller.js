'use strict';

const restaurantService = require('../services/restaurant.service');

/**
 * متحكّم المطاعم (Card 110) — مسارات تصفّح عامّة للزبائن، وإنشاء طلب من مطعم،
 * ومسارات إدارة (CRUD) للمطاعم وقوائمها من لوحة الأدمن.
 */

// قائمة المطاعم (فلترة اختيارية: ?city= &category= &q=)
async function listRestaurants(req, res, next) {
  try {
    res.json(await restaurantService.listRestaurants(req.query));
  } catch (err) {
    next(err);
  }
}

// تصنيفات المطاعم المتاحة (رقائق الفلترة في التطبيق)
async function listCategories(req, res, next) {
  try {
    res.json(await restaurantService.listCategories());
  } catch (err) {
    next(err);
  }
}

// مطعم واحد + قائمته مجمّعة بالأقسام
async function getRestaurant(req, res, next) {
  try {
    res.json(await restaurantService.getRestaurantWithMenu(req.params.restaurantId));
  } catch (err) {
    next(err);
  }
}

// الزبون ينشئ طلبًا من مطعم (سلّة أصناف + عنوان التسليم)
async function createRestaurantOrder(req, res, next) {
  try {
    const idempotencyKey = req.get('Idempotency-Key');
    const order = await restaurantService.createRestaurantOrder(
      req.auth.id,
      req.body,
      idempotencyKey
    );
    res.status(201).json(order);
  } catch (err) {
    next(err);
  }
}

// ── إدارة (أدمن) ────────────────────────────────────────────────────────────

async function adminListRestaurants(req, res, next) {
  try {
    res.json(await restaurantService.adminListRestaurants());
  } catch (err) {
    next(err);
  }
}

async function createRestaurant(req, res, next) {
  try {
    res.status(201).json(await restaurantService.createRestaurant(req.body));
  } catch (err) {
    next(err);
  }
}

async function updateRestaurant(req, res, next) {
  try {
    res.json(await restaurantService.updateRestaurant(req.params.restaurantId, req.body));
  } catch (err) {
    next(err);
  }
}

async function deleteRestaurant(req, res, next) {
  try {
    res.json(await restaurantService.deleteRestaurant(req.params.restaurantId));
  } catch (err) {
    next(err);
  }
}

// رفع/تغيير صورة غلاف المطعم من الجهاز (الملفّ في req.file عبر multer)
async function uploadRestaurantImage(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'أرفق صورة' });
    const restaurant = await restaurantService.setRestaurantImage(req.params.restaurantId, req.file);
    res.json({ ok: true, imageUrl: restaurant.imageUrl, restaurant });
  } catch (err) {
    next(err);
  }
}

async function adminListMenu(req, res, next) {
  try {
    res.json(await restaurantService.adminListMenu(req.params.restaurantId));
  } catch (err) {
    next(err);
  }
}

async function createMenuItem(req, res, next) {
  try {
    res.status(201).json(await restaurantService.createMenuItem(req.params.restaurantId, req.body));
  } catch (err) {
    next(err);
  }
}

async function updateMenuItem(req, res, next) {
  try {
    res.json(await restaurantService.updateMenuItem(req.params.itemId, req.body));
  } catch (err) {
    next(err);
  }
}

// رفع/تغيير صورة صنف من الجهاز (الملفّ في req.file عبر multer)
async function uploadMenuItemImage(req, res, next) {
  try {
    if (!req.file) return res.status(400).json({ message: 'أرفق صورة' });
    const item = await restaurantService.setMenuItemImage(req.params.itemId, req.file);
    res.json({ ok: true, imageUrl: item.imageUrl, item });
  } catch (err) {
    next(err);
  }
}

async function deleteMenuItem(req, res, next) {
  try {
    res.json(await restaurantService.deleteMenuItem(req.params.itemId));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listRestaurants,
  listCategories,
  getRestaurant,
  createRestaurantOrder,
  adminListRestaurants,
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
  uploadRestaurantImage,
  adminListMenu,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  uploadMenuItemImage,
};
