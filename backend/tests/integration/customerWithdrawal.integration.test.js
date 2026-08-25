'use strict';

// اختبارات تكامل لسحب رصيد الزبائن (Card 98) ومنع السحب أثناء طلب جارٍ (Card 99).
// تتخطّى نفسها تلقائيًا إن لم تتوفّر قاعدة بيانات (انظر setup.js).

const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after, beforeEach } = require('node:test');

const { connect, disconnect, clearDb, state } = require('./setup');

const User = require('../../src/models/User');
const Order = require('../../src/models/Order');
const CustomerWithdrawal = require('../../src/models/CustomerWithdrawal');
const walletService = require('../../src/services/wallet.service');
const withdrawalService = require('../../src/services/customerWithdrawal.service');
const { ORDER_STATUS, WITHDRAWAL_STATUS } = require('../../src/utils/constants');

before(connect);
after(disconnect);
beforeEach(clearDb);

async function makeUser(balance = 100) {
  const u = new User({ name: 'زبون', phone: `u${Date.now()}${Math.random()}` });
  await u.setPassword('secret1');
  await u.save();
  if (balance) await walletService.creditWallet(u._id, balance);
  return u;
}

const payload = () => ({ amount: 40, destination: 'جوال باي', accountNumber: '0599123456' });

test('Card 98: طلب سحب صالح يُنشأ معلّقًا ويحجز من المتاح', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser(100);

  const w = await withdrawalService.requestWithdrawal(user._id, payload());
  assert.equal(w.status, WITHDRAWAL_STATUS.PENDING);
  assert.equal(w.amount, 40);

  // الرصيد الفعلي لم يُخصم بعد، لكن المتاح نقص بمقدار المعلّق
  const avail = await withdrawalService.getAvailable(user._id);
  assert.equal(avail.balance, 100);
  assert.equal(avail.pending, 40);
  assert.equal(avail.available, 60);
});

test('Card 98: موافقة الأدمن (done) تخصم من محفظة الزبون فعليًّا', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser(100);
  const w = await withdrawalService.requestWithdrawal(user._id, payload());

  const res = await withdrawalService.process('admin1', w._id, 'done', 'حُوّل');
  assert.equal(res.withdrawal.status, WITHDRAWAL_STATUS.DONE);
  assert.equal(res.balance, 60, 'خُصم 40 من 100');

  const summary = await walletService.getWalletSummary(user._id);
  assert.equal(summary.balance, 60);
});

test('Card 98: رفض الأدمن لا يخصم رصيدًا', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser(100);
  const w = await withdrawalService.requestWithdrawal(user._id, payload());

  const res = await withdrawalService.process('admin1', w._id, 'rejected', 'بيانات ناقصة');
  assert.equal(res.withdrawal.status, WITHDRAWAL_STATUS.REJECTED);

  const summary = await walletService.getWalletSummary(user._id);
  assert.equal(summary.balance, 100, 'الرصيد كما هو');
});

test('Card 99: يُمنع السحب أثناء وجود طلب جارٍ', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser(100);
  // طلب جارٍ للزبون (assigned)
  await Order.create({
    user: user._id,
    status: ORDER_STATUS.ASSIGNED,
    pickup: { address: 'الاستلام', location: { type: 'Point', coordinates: [34.44, 31.5] } },
    dropoff: { address: 'التسليم', location: { type: 'Point', coordinates: [34.45, 31.51] } },
    price: 10,
  });

  await assert.rejects(
    () => withdrawalService.requestWithdrawal(user._id, payload()),
    /طلب جارٍ/
  );
  // لم يُنشأ أي طلب سحب
  assert.equal(await CustomerWithdrawal.countDocuments({ user: user._id }), 0);
});

test('Card 99: يُسمح بالسحب بعد اكتمال الطلب (delivered)', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser(100);
  await Order.create({
    user: user._id,
    status: ORDER_STATUS.DELIVERED,
    pickup: { address: 'الاستلام', location: { type: 'Point', coordinates: [34.44, 31.5] } },
    dropoff: { address: 'التسليم', location: { type: 'Point', coordinates: [34.45, 31.51] } },
    price: 10,
  });

  const w = await withdrawalService.requestWithdrawal(user._id, payload());
  assert.equal(w.status, WITHDRAWAL_STATUS.PENDING);
});
