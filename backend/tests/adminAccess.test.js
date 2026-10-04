'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const User = require('../src/models/User');
const { requireAdminCapabilityIfAdmin } = require('../src/middlewares/adminAccess.middleware');

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

async function withAdminRole(adminRole, fn) {
  const original = User.findById;
  User.findById = () => ({
    select: async () => ({ isActive: true, adminRole }),
  });
  try {
    return await fn();
  } finally {
    User.findById = original;
  }
}

test('admin capability guard bypasses non-admin roles', async () => {
  const original = User.findById;
  let queried = false;
  User.findById = () => {
    queried = true;
    throw new Error('should not query admin record');
  };
  try {
    const result = await runMiddleware(requireAdminCapabilityIfAdmin('orders'), {
      id: 'user-1',
      role: 'user',
    });
    assert.equal(result.nextCalled, true);
    assert.equal(queried, false);
  } finally {
    User.findById = original;
  }
});

test('marketing admin cannot bypass into order read routes', async () => {
  await withAdminRole('marketing', async () => {
    const result = await runMiddleware(requireAdminCapabilityIfAdmin('orders:read'), {
      id: 'admin-1',
      role: 'admin',
    });
    assert.equal(result.nextCalled, false);
    assert.equal(result.statusCode, 403);
    assert.equal(result.body.permission, 'orders:read');
  });
});

test('support admin may read orders but cannot mutate them', async () => {
  await withAdminRole('support', async () => {
    const read = await runMiddleware(requireAdminCapabilityIfAdmin('orders:read'), {
      id: 'admin-2',
      role: 'admin',
    });
    assert.equal(read.nextCalled, true);

    const write = await runMiddleware(requireAdminCapabilityIfAdmin('orders'), {
      id: 'admin-2',
      role: 'admin',
    });
    assert.equal(write.statusCode, 403);
    assert.equal(write.body.permission, 'orders');
  });
});

test('support admin retains chat capability', async () => {
  await withAdminRole('support', async () => {
    const result = await runMiddleware(requireAdminCapabilityIfAdmin('chats'), {
      id: 'admin-3',
      role: 'admin',
    });
    assert.equal(result.nextCalled, true);
  });
});

test('operations admin may perform order mutations', async () => {
  await withAdminRole('operations', async () => {
    const result = await runMiddleware(requireAdminCapabilityIfAdmin('orders'), {
      id: 'admin-4',
      role: 'admin',
    });
    assert.equal(result.nextCalled, true);
  });
});
