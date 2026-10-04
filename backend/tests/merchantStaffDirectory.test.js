'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Merchant = require('../src/models/Merchant');
const service = require('../src/services/merchantStaff.service');

test('cashier cannot list merchant staff directory', async () => {
  await assert.rejects(
    service.list('merchant-1', { staffRole: 'cashier', restaurantId: 'restaurant-1' }),
    (err) => err?.statusCode === 403
  );
});

test('manager cannot list merchant staff directory', async () => {
  await assert.rejects(
    service.list('merchant-1', { staffRole: 'manager', restaurantId: 'restaurant-1' }),
    (err) => err?.statusCode === 403
  );
});

test('owner may list merchant staff directory', async () => {
  const originalFindById = Merchant.findById;
  const MerchantStaff = require('../src/models/MerchantStaff');
  const originalFind = MerchantStaff.find;
  Merchant.findById = async () => ({ _id: 'merchant-1', isActive: true });
  MerchantStaff.find = () => ({
    select: () => ({
      sort: () => ({ lean: async () => [] }),
    }),
  });
  try {
    const rows = await service.list('merchant-1', { staffRole: 'owner', restaurantId: 'restaurant-1' });
    assert.deepEqual(rows, []);
  } finally {
    Merchant.findById = originalFindById;
    MerchantStaff.find = originalFind;
  }
});
