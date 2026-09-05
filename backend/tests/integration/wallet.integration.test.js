'use strict';

// اختبارات تكامل لمحفظة المستخدم وشحن الرصيد — على قاعدة بيانات حقيقية.
// تتخطّى نفسها تلقائيًا إن لم تتوفّر قاعدة بيانات (انظر setup.js).
//
// التشغيل:  npm run test:integration

const test = require('node:test');
const assert = require('node:assert/strict');
const { before, after, beforeEach } = require('node:test');

const { connect, disconnect, clearDb, state } = require('./setup');

const User = require('../../src/models/User');
const Wallet = require('../../src/models/Wallet');
const walletService = require('../../src/services/wallet.service');
const paymentService = require('../../src/services/payment');
const { PAYMENT_METHOD, TOPUP_STATUS } = require('../../src/utils/constants');

before(connect);
after(disconnect);
beforeEach(clearDb);

async function makeUser() {
  const u = new User({ name: 'عميل', phone: `u${Date.now()}${Math.random()}` });
  await u.setPassword('secret1');
  return u.save();
}

async function makeAdmin() {
  const a = new User({ name: 'مدير', phone: `a${Date.now()}${Math.random()}`, role: 'admin' });
  await a.setPassword('secret1');
  return a.save();
}

test('الشحن اليدوي يُنشئ حركة معلّقة دون إضافة رصيد', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser();

  const tx = await paymentService.requestTopUp({
    userId: user._id,
    method: PAYMENT_METHOD.JAWWAL_PAY,
    amount: 100,
    proof: { imageUrl: '/uploads/r1.jpg', referenceNumber: 'TX-123' },
  });

  assert.equal(tx.status, TOPUP_STATUS.PENDING);
  assert.equal(tx.amount, 100);
  const { balance } = await walletService.getWalletSummary(user._id);
  assert.equal(balance, 0); // لا رصيد قبل الموافقة
});

test('موافقة الأدمن تضيف الرصيد، وهي آمنة ضدّ التكرار', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser();
  const admin = await makeAdmin();

  const tx = await paymentService.requestTopUp({
    userId: user._id,
    method: PAYMENT_METHOD.BANK_OF_PALESTINE,
    amount: 250,
    proof: { imageUrl: '/uploads/r2.jpg', referenceNumber: 'TX-999' },
  });

  const res = await walletService.approveTopup(admin._id, tx._id, 'تمّ التحقّق');
  assert.equal(res.balance, 250);
  assert.equal(res.transaction.status, TOPUP_STATUS.APPROVED);
  assert.equal(res.transaction.balanceAfter, 250);

  // موافقة ثانية على نفس العملية يجب أن تُرفض (لا تضاعف الرصيد)
  await assert.rejects(() => walletService.approveTopup(admin._id, tx._id));
  const { balance } = await walletService.getWalletSummary(user._id);
  assert.equal(balance, 250); // بقي كما هو
});

test('رفض الأدمن لا يضيف رصيدًا', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser();
  const admin = await makeAdmin();

  const tx = await paymentService.requestTopUp({
    userId: user._id,
    method: PAYMENT_METHOD.PALPAY,
    amount: 80,
    proof: { imageUrl: '/uploads/r3.jpg', referenceNumber: 'TX-777' },
  });

  const res = await walletService.rejectTopup(admin._id, tx._id, 'إيصال غير واضح');
  assert.equal(res.transaction.status, TOPUP_STATUS.REJECTED);

  const { balance } = await walletService.getWalletSummary(user._id);
  assert.equal(balance, 0);
  // لا يمكن الموافقة بعد الرفض
  await assert.rejects(() => walletService.approveTopup(admin._id, tx._id));
});

test('الخصم من المحفظة يمنع الرصيد السالب', async (t) => {
  if (!state.dbReady) return t.skip('لا قاعدة بيانات');
  const user = await makeUser();
  await walletService.creditWallet(user._id, 100);

  await walletService.debitWallet(user._id, 60);
  let wallet = await Wallet.findOne({ user: user._id });
  assert.equal(wallet.balance, 40);

  // خصم أكبر من الرصيد يُرفض ولا يغيّر الرصيد
  await assert.rejects(() => walletService.debitWallet(user._id, 1000));
  wallet = await Wallet.findOne({ user: user._id });
  assert.equal(wallet.balance, 40);
});
