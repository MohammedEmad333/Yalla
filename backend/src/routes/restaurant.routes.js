'use strict';

// مسارات تصفّح المطاعم وقوائمها (Card 110) — عامّة للقراءة كما في /neighborhoods،
// ليتمكّن التطبيق (وصفحة الموقع لاحقًا) من عرض المطاعم قبل تسجيل الدخول.
// إنشاء الطلب نفسه يبقى محميًّا (مسار /orders/restaurant).

const router = require('express').Router();
const ctrl = require('../controllers/restaurant.controller');

// التصنيفات قبل مسار المعرّف لتفادي التقاط "categories" كمعرّف مطعم
router.get('/categories', ctrl.listCategories);
router.get('/', ctrl.listRestaurants);
router.get('/:restaurantId', ctrl.getRestaurant);

module.exports = router;
