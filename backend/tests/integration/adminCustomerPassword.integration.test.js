'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after, beforeEach } = require('node:test');
const { connect, disconnect, clearDb, state } = require('./setup');
const User = require('../../src/models/User');
const Log = require('../../src/models/Log');
const { updateCustomer } = require('../../src/services/admin.service');
const { accountStillAllowed } = require('../../src/middlewares/auth.middleware');

before(connect);
after(disconnect);
beforeEach(clearDb);

test('only Super Admin can change a customer password', async (t) => {
  if (!state.dbReady) return t.skip('MongoDB unavailable');
  const account = new User({ name: 'Customer', phone: '0597123456' });
  await account.setPassword('OldPassword123');
  await account.save();
  await assert.rejects(
    updateCustomer(account.id, { newPassword: 'NewPassword123' }, account.id, 'operations'),
    { statusCode: 403 },
  );
  const untouched = await User.findById(account.id).select('+passwordHash');
  assert.equal(await untouched.verifyPassword('OldPassword123'), true);
});

test('reset hashes the replacement, revokes prior sessions and logs no secret', async (t) => {
  if (!state.dbReady) return t.skip('MongoDB unavailable');
  const account = new User({ name: 'Customer', phone: '0597123457' });
  await account.setPassword('OldPassword123');
  await account.save();
  const previous = { id: String(account.id), role: 'user' };
  assert.equal(await accountStillAllowed(previous), true);
  const result = await updateCustomer(account.id, { newPassword: 'NewPassword123' }, account.id, 'super_admin');
  const saved = await User.findById(account.id).select('+passwordHash +sessionVersion');
  assert.equal(await saved.verifyPassword('NewPassword123'), true);
  assert.equal(await saved.verifyPassword('OldPassword123'), false);
  assert.equal(saved.sessionVersion, 1);
  assert.equal(await accountStillAllowed(previous), false);
  assert.equal(await accountStillAllowed({ ...previous, sessionVersion: 1 }), true);
  assert.equal(result.passwordChanged, true);
  const log = await Log.findOne({ action: 'CUSTOMER_PROFILE_UPDATED' });
  assert.equal(log.meta.passwordChanged, true);
  assert.deepEqual(log.meta.fields, []);
  assert.equal(JSON.stringify(log).includes('NewPassword123'), false);
});
