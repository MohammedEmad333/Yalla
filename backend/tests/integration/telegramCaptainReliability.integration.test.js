'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after, beforeEach } = require('node:test');
const mongoose = require('mongoose');
const { connect, disconnect, clearDb, state } = require('./setup');
const Captain = require('../../src/models/Captain');
const Link = require('../../src/models/TelegramCaptainLink');
const Delivery = require('../../src/models/TelegramCaptainDelivery');
const { sendOnce } = require('../../src/services/telegramCaptainDelivery.service');
const { getSettings, setSettings } = require('../../src/services/telegramCaptainNotificationSettings.service');
before(connect);
after(disconnect);
beforeEach(clearDb);
async function fixture() {
  const captain = await Captain.create({ name: 'Captain', phone: '0599000088',
    passwordHash: 'test-only', isApproved: true });
  await Link.create({ captainId: captain._id, telegramUserId: '7777', telegramChatId: '7777' });
  return captain;
}
test('Mongo ledger retains successes across new callers and blocks simultaneous duplicates', async t => {
  if (!state.dbReady) return t.skip('MongoDB unavailable');
  await Delivery.init(); // ensure unique index is present before concurrency test
  const event = { captainId: new mongoose.Types.ObjectId().toString(),
    orderId: new mongoose.Types.ObjectId().toString(), kind: 'status', status: 'accepted' };
  let attempts = 0;
  let release, started;
  const entered = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const first = sendOnce(event, async () => { attempts++; started(); await gate; });
  await entered;
  try {
    assert.deepEqual(await sendOnce(event, async () => { attempts++; }), { status: 'in-flight' });
  } finally { release(); }
  assert.deepEqual(await first, { status: 'sent' });
  assert.deepEqual(await sendOnce(event, async () => { attempts++; }), { status: 'duplicate' });
  assert.equal(attempts, 1);
  const doc = await Delivery.findOne({}).lean();
  assert.equal(doc.state, 'sent');
  assert.equal(doc.key.length, 64);
});
test('notification settings only allow approved private linked captains and valid booleans', async t => {
  if (!state.dbReady) return t.skip('MongoDB unavailable');
  const captain = await fixture();
  const identity = { telegramUserId: '7777', telegramChatId: '7777' };
  assert.deepEqual(await getSettings(identity), { linked: true, assigned: true, status: true });
  assert.deepEqual(await setSettings({ ...identity, kind: 'assigned', enabled: false }),
    { linked: true, assigned: false, status: true });
  assert.deepEqual(await getSettings(identity), { linked: true, assigned: false, status: true });
  assert.deepEqual(await setSettings({ ...identity, kind: 'assigned', enabled: false }),
    { linked: true, assigned: false, status: true });
  assert.deepEqual(await getSettings({ telegramUserId: '7777', telegramChatId: '9999' }),
    { linked: false });
  assert.deepEqual(await setSettings({ telegramUserId: '9999', telegramChatId: '9999',
    kind: 'status', enabled: false }), { linked: false });
  await assert.rejects(setSettings({ ...identity, kind: 'unknown', enabled: false }), { status: 400 });
  await assert.rejects(setSettings({ ...identity, kind: 'assigned', enabled: 'false' }), { status: 400 });
  await Captain.updateOne({ _id: captain._id }, { $set: { isApproved: false } });
  assert.deepEqual(await getSettings(identity), { linked: false });
  await Link.deleteOne({ captainId: captain._id });
  assert.deepEqual(await getSettings(identity), { linked: false });
});
