'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { _test } = require('../src/services/merchantStaff.service');

test('merchant login branch fallback prefers activeRestaurant then primary then extra branches', () => {
  const merchant = {
    activeRestaurant: 'inactive-active',
    restaurant: 'primary',
    restaurants: ['extra'],
  };

  const candidates = _test.branchCandidates(merchant);
  assert.deepEqual(candidates, ['inactive-active', 'primary', 'extra']);

  const picked = _test.pickFallbackBranch(candidates, [
    { _id: 'inactive-active', active: false, name: 'Disabled' },
    { _id: 'primary', active: true, name: 'Primary' },
    { _id: 'extra', active: true, name: 'Extra' },
  ]);

  assert.equal(String(picked._id), 'primary');
});

test('merchant login branch fallback can recover to an extra active branch', () => {
  const merchant = {
    activeRestaurant: 'deleted',
    restaurant: 'disabled-primary',
    restaurants: ['extra-active'],
  };

  const candidates = _test.branchCandidates(merchant);
  const picked = _test.pickFallbackBranch(candidates, [
    { _id: 'disabled-primary', active: false },
    { _id: 'extra-active', active: true },
  ]);

  assert.equal(String(picked._id), 'extra-active');
});

test('merchant login branch fallback returns null when no active branch exists', () => {
  const picked = _test.pickFallbackBranch(
    ['missing', 'disabled'],
    [{ _id: 'disabled', active: false }]
  );

  assert.equal(picked, null);
});
