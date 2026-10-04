'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { requireMerchantCapability, ROLE_RULES } = require('../src/middlewares/merchantAccess.middleware');

function runMiddleware(middleware, auth) {
  return new Promise((resolve, reject) => {
    const response = {
      statusCode: 200,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        resolve({ nextCalled: false, statusCode: this.statusCode, body });
        return this;
      },
    };
    const next = (err) => {
      if (err) return reject(err);
      resolve({ nextCalled: true, statusCode: response.statusCode, body: response.body });
    };
    Promise.resolve(middleware({ auth }, response, next)).catch(reject);
  });
}

test('owner retains all merchant capabilities', () => {
  for (const capability of ['profile','branches','restaurant','menu','inventory','orders']) {
    assert.equal(ROLE_RULES.owner(capability), true);
  }
});

test('manager may operate restaurant/menu/inventory/orders but not branches', async () => {
  for (const capability of ['profile','restaurant','menu','inventory','orders']) {
    const result = await runMiddleware(requireMerchantCapability(capability), { staffRole: 'manager' });
    assert.equal(result.nextCalled, true, capability);
  }
  const denied = await runMiddleware(requireMerchantCapability('branches'), { staffRole: 'manager' });
  assert.equal(denied.statusCode, 403);
  assert.equal(denied.body.permission, 'branches');
});

test('cashier is restricted to profile and order operations', async () => {
  for (const capability of ['profile','orders']) {
    const result = await runMiddleware(requireMerchantCapability(capability), { staffRole: 'cashier' });
    assert.equal(result.nextCalled, true, capability);
  }
  for (const capability of ['branches','restaurant','menu','inventory']) {
    const result = await runMiddleware(requireMerchantCapability(capability), { staffRole: 'cashier' });
    assert.equal(result.statusCode, 403, capability);
    assert.equal(result.body.staffRole, 'cashier');
  }
});

test('missing staffRole is treated as owner for legacy owner tokens', async () => {
  const result = await runMiddleware(requireMerchantCapability('branches'), {});
  assert.equal(result.nextCalled, true);
});

test('unknown merchant staff roles fail closed', async () => {
  const result = await runMiddleware(requireMerchantCapability('orders'), { staffRole: 'unexpected-role' });
  assert.equal(result.statusCode, 403);
});
