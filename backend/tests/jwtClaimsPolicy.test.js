'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const env = require('../src/config/env');
const {
  claimsPolicyAllows,
  LEGACY_CLAIMLESS_ISSUED_BEFORE,
} = require('../src/middlewares/auth.middleware');

test('JWT claims policy accepts the configured issuer and audience', () => {
  assert.equal(claimsPolicyAllows({
    iss: env.jwtIssuer,
    aud: env.jwtAudience,
    iat: LEGACY_CLAIMLESS_ISSUED_BEFORE + 1,
  }), true);
});

test('JWT claims policy accepts configured audience inside an array', () => {
  assert.equal(claimsPolicyAllows({
    iss: env.jwtIssuer,
    aud: ['another-client', env.jwtAudience],
    iat: LEGACY_CLAIMLESS_ISSUED_BEFORE + 1,
  }), true);
});

test('JWT claims policy only allows fully claimless legacy tokens issued before migration cutoff', () => {
  assert.equal(claimsPolicyAllows({ iat: LEGACY_CLAIMLESS_ISSUED_BEFORE - 1 }), true);
  assert.equal(claimsPolicyAllows({ iat: LEGACY_CLAIMLESS_ISSUED_BEFORE }), false);
  assert.equal(claimsPolicyAllows({ iat: LEGACY_CLAIMLESS_ISSUED_BEFORE + 1 }), false);
});

test('JWT claims policy rejects partial or incorrect claims', () => {
  assert.equal(claimsPolicyAllows({
    iss: env.jwtIssuer,
    iat: LEGACY_CLAIMLESS_ISSUED_BEFORE - 1,
  }), false);
  assert.equal(claimsPolicyAllows({
    aud: env.jwtAudience,
    iat: LEGACY_CLAIMLESS_ISSUED_BEFORE - 1,
  }), false);
  assert.equal(claimsPolicyAllows({
    iss: 'wrong-issuer',
    aud: env.jwtAudience,
    iat: LEGACY_CLAIMLESS_ISSUED_BEFORE - 1,
  }), false);
});
