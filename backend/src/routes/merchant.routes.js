'use strict';

const router = require('express').Router();
const ctrl = require('../controllers/merchant.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');
const { uploadImage } = require('../middlewares/upload.middleware');
const { ROLES } = require('../utils/constants');

router.use(authenticate, authorize(ROLES.MERCHANT));

router.get('/profile', ctrl.profile);
router.patch('/restaurant', ctrl.updateRestaurant);
router.post('/restaurant/image', uploadImage.single('image'), ctrl.uploadRestaurantImage);
router.get('/menu', ctrl.listMenu);
router.post('/menu', ctrl.createMenuItem);
router.patch('/menu/:itemId', ctrl.updateMenuItem);
router.delete('/menu/:itemId', ctrl.deleteMenuItem);
router.post('/menu/:itemId/image', uploadImage.single('image'), ctrl.uploadMenuItemImage);
router.get('/inventory', ctrl.inventorySummary);
router.patch('/inventory/:itemId', ctrl.adjustInventory);
router.get('/orders', ctrl.listOrders);
router.patch('/orders/:orderId/status', ctrl.updateOrderStatus);

module.exports = router;
