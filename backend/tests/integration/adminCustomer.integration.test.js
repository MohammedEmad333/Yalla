'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after, beforeEach } = require('node:test');
const { connect, disconnect, clearDb, state } = require('./setup');
const User = require('../../src/models/User');
const Captain = require('../../src/models/Captain');
const Log = require('../../src/models/Log');
const service = require('../../src/services/admin.service');

before(connect);
after(disconnect);
beforeEach(clearDb);

async function customer(name, phone, extra = {}) {
  const user = new User({ name, phone, role: 'user', ...extra });
  await user.setPassword('secret123');
  return user.save();
}

test('admin changes customer profile, retains password and logs changed fields', async (t) => {
  if (!state.dbReady) return t.skip('MongoDB unavailable');
  const actor = await customer('Admin actor record', '0597000001');
  const user = await customer('Old', '0597000002', {
    lastName: 'Surname',
    email: 'old@example.com',
    emailVerifiedAt: new Date('2026-01-01'),
    address: 'Old street',
  });

  const result = await service.updateCustomer(user._id, {
    name: 'New', phone: '+970 59 700 0003', email: 'NEW@EXAMPLE.COM', address: 'New street',
  }, actor._id);

  assert.deepEqual(result.changed.sort(), ['address', 'email', 'name', 'phone']);
  const saved = await User.findById(user._id).select('+passwordHash');
  assert.equal(saved.name, 'New');
  assert.equal(saved.lastName, 'Surname');
  assert.equal(saved.phone, '0597000003');
  assert.equal(saved.email, 'new@example.com');
  assert.equal(saved.address, 'New street');
  assert.equal(saved.emailVerifiedAt, null);
  assert.equal(saved.role, 'user');
  assert.equal(await saved.verifyPassword('secret123'), true);
  const log = await Log.findOne({ action: 'CUSTOMER_PROFILE_UPDATED' });
  assert.equal(String(log.actorId), String(actor._id));
  assert.equal(log.meta.userId, String(user._id));
  assert.ok(!JSON.stringify(log.meta).includes('New street'));
});

test('customer edit rejects duplicates, protected fields, missing customer and admin accounts', async (t) => {
  if (!state.dbReady) return t.skip('MongoDB unavailable');
  const a = await customer('A', '0597000004', { email: 'one@example.com' });
  const b = await customer('B', '0597000005', { email: 'two@example.com' });
  await assert.rejects(() => service.updateCustomer(b._id, { phone: a.phone }, a._id), { statusCode: 409 });
  await assert.rejects(() => service.updateCustomer(b._id, { email: a.email }, a._id), { statusCode: 409 });
  await assert.rejects(() => service.updateCustomer(b._id, { role: 'admin' }, a._id), { statusCode: 400 });
  await assert.rejects(() => service.updateCustomer('not-an-id', { name: 'X' }, a._id), { statusCode: 400 });
  await assert.rejects(() => service.updateCustomer('507f191e810c19729de860ea', { name: 'X' }, a._id), { statusCode: 404 });

  const admin = await customer('Admin', '0597000006', { role: 'admin', adminRole: 'operations' });
  await assert.rejects(() => service.updateCustomer(admin._id, { name: 'X' }, a._id), { statusCode: 404 });

  const captain = new Captain({ name: 'Captain', phone: '0597000007' });
  await captain.setPassword('secret123');
  await captain.save();
  await assert.rejects(() => service.updateCustomer(b._id, { phone: captain.phone }, a._id), { statusCode: 409 });
});

test('customer email can be cleared; other customer email can then be reused', async (t) => {
  if (!state.dbReady) return t.skip('MongoDB unavailable');
  const a = await customer('A', '0597000008', { email: 'shared@example.com' });
  const b = await customer('B', '0597000009');
  await service.updateCustomer(a._id, { email: '' }, a._id);
  assert.equal((await User.findById(a._id)).email, undefined);
  await service.updateCustomer(b._id, { email: 'shared@example.com' }, a._id);
  assert.equal((await User.findById(b._id)).email, 'shared@example.com');
});
