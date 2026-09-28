'use strict';

const crypto = require('crypto');
const env = require('../config/env');

function httpError(message, statusCode = 502) {
  return Object.assign(new Error(message), { statusCode });
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function configured() {
  const cfg = env.jawwalPay;
  if (env.nodeEnv === 'test') return true;
  return Boolean(
    cfg?.baseUrl &&
    cfg?.privateKey &&
    ((cfg.authMode === 'oauth2' && cfg.clientId && cfg.clientSecret) ||
      (cfg.authMode !== 'oauth2' && cfg.username && cfg.password))
  );
}

let cachedToken = null;
let tokenExpiresAt = 0;

async function oauthToken() {
  const cfg = env.jawwalPay;
  if (cachedToken && Date.now() < tokenExpiresAt - 30_000) return cachedToken;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  }).toString();

  const response = await fetch(new URL('/oauth/token', cfg.baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw httpError(data.message || 'تعذّر تسجيل الدخول إلى بوابة جوال');
  }
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (Number(data.expires_in) || 3600) * 1000;
  return cachedToken;
}

async function authorizationHeader() {
  const cfg = env.jawwalPay;
  if (cfg.authMode === 'oauth2') return `Bearer ${await oauthToken()}`;
  return `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64')}`;
}

async function request(method, path, payload, { idempotencyKey } = {}) {
  if (!configured()) throw httpError('بوابة جوال غير مهيأة على الخادم', 503);

  if (env.nodeEnv === 'test') {
    const reference = `test-${idempotencyKey || Date.now()}`;
    return method === 'POST' && path.endsWith('/confirm')
      ? { status: 'paid', outcome: 'PAID', reference, transaction_id: reference }
      : { status: 'otp_sent', reference, payment_reference: reference };
  }

  const cfg = env.jawwalPay;
  const body = payload == null ? '' : JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const canonical = [method.toUpperCase(), path, timestamp, sha256(body)].join('\n');
  const signature = crypto.createHmac('sha256', cfg.privateKey).update(canonical).digest('hex');

  const response = await fetch(new URL(path, cfg.baseUrl), {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: await authorizationHeader(),
      'X-Timestamp': timestamp,
      'X-Signature': signature,
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    ...(body ? { body } : {}),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = httpError(data.message || data.error || 'رفضت بوابة جوال عملية الدفع', response.status >= 500 ? 502 : 400);
    err.providerResponse = data;
    throw err;
  }
  return data;
}

function referenceOf(data = {}) {
  return String(data.payment_reference || data.reference || data.id || '').trim();
}

function transactionIdOf(data = {}) {
  return String(data.transaction_id || data.transactionId || data.provider_transaction_id || '').trim();
}

function isPaid(data = {}) {
  const status = String(data.status || '').toLowerCase();
  const outcome = String(data.outcome || '').toUpperCase();
  return status === 'paid' || outcome === 'PAID' || data.paid === true;
}

async function createPayment({ phone, amount, externalReference, idempotencyKey }) {
  const data = await request('POST', '/v1/payments', {
    phone,
    amount,
    currency: 'ILS',
    external_reference: externalReference,
  }, { idempotencyKey });
  const reference = referenceOf(data);
  if (!reference) throw httpError('بوابة جوال لم تُرجع مرجع عملية الدفع');
  return { data, reference, transactionId: transactionIdOf(data) };
}

async function confirmPayment(reference, otp) {
  return request('POST', `/v1/payments/${encodeURIComponent(reference)}/confirm`, { otp });
}

async function cancelPayment(reference) {
  return request('POST', `/v1/payments/${encodeURIComponent(reference)}/cancel`, {});
}

async function getPayment(reference) {
  return request('GET', `/v1/payments/${encodeURIComponent(reference)}`, null);
}

module.exports = {
  configured,
  createPayment,
  confirmPayment,
  cancelPayment,
  getPayment,
  isPaid,
  referenceOf,
  transactionIdOf,
};
