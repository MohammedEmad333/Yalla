'use strict';

const ManualReceiptUploadStrategy = require('./ManualReceiptUploadStrategy');
const walletService = require('../wallet.service');
const { isSupportedMethod, normalizeAmount, PAYMENT_METHODS } = require('../../utils/topup');
const { PAYMENT_METHOD } = require('../../utils/constants');

const registry = new Map();

function register(strategy) {
  registry.set(strategy.key, strategy);
}

register(new ManualReceiptUploadStrategy(PAYMENT_METHOD.BANK_OF_PALESTINE));
register(new ManualReceiptUploadStrategy(PAYMENT_METHOD.JAWWAL_PAY));
register(new ManualReceiptUploadStrategy(PAYMENT_METHOD.PALPAY));

function getAvailableMethods() {
  return Object.values(PAYMENT_METHODS).map((m) => ({
    key: m.key,
    label: m.label,
    color: m.color,
    mode: m.mode,
    account: m.account,
    instructions: m.instructions,
  }));
}

async function requestTopUp({ userId, method, amount, proof = {}, idempotencyKey }) {
  if (!isSupportedMethod(method)) {
    throw Object.assign(new Error('طريقة دفع غير مدعومة'), { statusCode: 400 });
  }
  const parsed = normalizeAmount(amount);
  if (!parsed.ok) throw Object.assign(new Error(parsed.error), { statusCode: 400 });
  const strategy = registry.get(method);
  if (!strategy) {
    throw Object.assign(new Error('طريقة الدفع غير مفعّلة حاليًا'), { statusCode: 501 });
  }
  return strategy.initiateTopUp(
    { userId, amount: parsed.value, proof, idempotencyKey },
    { walletService }
  );
}

module.exports = {
  register,
  getAvailableMethods,
  requestTopUp,
  _registry: registry,
};
