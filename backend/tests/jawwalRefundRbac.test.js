'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { ROLE_RULES } = require('../src/middlewares/adminAccess.middleware');

test('Jawwal refund capability is finance-only among scoped admin roles', () => {
  assert.equal(ROLE_RULES.finance('finance'), true);
  assert.equal(ROLE_RULES.super_admin('finance'), true);
  assert.equal(ROLE_RULES.support('finance'), false);
  assert.equal(ROLE_RULES.operations('finance'), false);
  assert.equal(ROLE_RULES.marketing('finance'), false);
});

test('support issues capability does not imply finance access', () => {
  assert.equal(ROLE_RULES.support('issues'), true);
  assert.equal(ROLE_RULES.support('finance'), false);
});
