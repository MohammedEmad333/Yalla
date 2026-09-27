'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after, beforeEach } = require('node:test');

const { connect, disconnect, clearDb, state } = require('./setup');
const Merchant = require('../../src/models/Merchant');
const Restaurant = require('../../src/models/Restaurant');
const applications = require('../../src/services/merchantApplication.service');
const staff = require('../../src/services/merchantStaff.service');
const branches = require('../../src/services/merchantBranch.service');

before(connect);
after(disconnect);
beforeEach(clearDb);

function payload(suffix = '') {
  return {
    name: 'تاجر يلا',
    phone: ('05981234' + suffix).slice(0, 10),
    password: 'secret1',
    storeName: 'متجر تجريبي',
    storePhone: '0598000000',
    category: 'مطاعم',
    city: 'غزة',
    neighborhood: 'الرمال',
    street: 'شارع الوحدة',
    description: 'طلب انضمام ذاتي',
  };
}

test('التسجيل الذاتي ينشئ حسابًا ومتجرًا غير ظاهر بحالة pending', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');

  const result = await applications.register(payload('01'));
  assert.ok(result.token);
  assert.equal(result.user.applicationStatus, 'pending');

  const merchant = await Merchant.findById(result.user.id).lean();
  const restaurant = await Restaurant.findById(merchant.restaurant).lean();

  assert.equal(merchant.applicationStatus, 'pending');
  assert.equal(restaurant.approvalStatus, 'pending');
  assert.equal(restaurant.approvalSource, 'self_service');
  assert.equal(restaurant.active, false);
  assert.equal(restaurant.isOpen, false);

  const loggedIn = await staff.login(merchant.phone, 'secret1');
  assert.equal(loggedIn.user.applicationStatus, 'pending');
});

test('اعتماد طلب المتجر يفعّل المتجر والحساب', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');

  const result = await applications.register(payload('02'));
  const merchant = await Merchant.findById(result.user.id);

  await applications.approve(merchant.restaurant);

  const approvedMerchant = await Merchant.findById(merchant._id).lean();
  const approvedRestaurant = await Restaurant.findById(merchant.restaurant).lean();
  assert.equal(approvedMerchant.applicationStatus, 'approved');
  assert.equal(approvedRestaurant.approvalStatus, 'approved');
  assert.equal(approvedRestaurant.active, true);
  assert.equal(approvedRestaurant.isOpen, true);
});

test('الفروع التي يضيفها التاجر تحتاج اعتمادًا مستقلًا', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');

  const result = await applications.register(payload('03'));
  const merchant = await Merchant.findById(result.user.id);
  await applications.approve(merchant.restaurant);

  const branch = await branches.create(merchant._id, { staffRole: 'owner' }, {
    name: 'الفرع الثاني',
    category: 'مطاعم',
    city: 'غزة',
    neighborhood: 'النصر',
  });

  assert.equal(branch.approvalStatus, 'pending');
  assert.equal(branch.active, false);

  await applications.approve(branch._id);
  const approvedBranch = await Restaurant.findById(branch._id).lean();
  const unchangedMerchant = await Merchant.findById(merchant._id).lean();
  assert.equal(approvedBranch.approvalStatus, 'approved');
  assert.equal(approvedBranch.active, true);
  assert.equal(unchangedMerchant.applicationStatus, 'approved');
});

test('رفض المتجر الأساسي يحفظ السبب ويمنع ظهوره', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');

  const result = await applications.register(payload('04'));
  const merchant = await Merchant.findById(result.user.id);

  await applications.reject(merchant.restaurant, 'بيانات العنوان غير مكتملة');

  const rejectedMerchant = await Merchant.findById(merchant._id).lean();
  const rejectedRestaurant = await Restaurant.findById(merchant.restaurant).lean();
  assert.equal(rejectedMerchant.applicationStatus, 'rejected');
  assert.equal(rejectedMerchant.applicationRejectionReason, 'بيانات العنوان غير مكتملة');
  assert.equal(rejectedRestaurant.approvalStatus, 'rejected');
  assert.equal(rejectedRestaurant.active, false);
});
