'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { TRACKABLE_ORDER_STATUSES } = require('../src/utils/trackingRules');
const { ORDER_STATUS } = require('../src/utils/constants');
test('tracking allowed only during live delivery lifecycle', () => {
  assert.deepEqual(TRACKABLE_ORDER_STATUSES, [ORDER_STATUS.ASSIGNED, ORDER_STATUS.ACCEPTED, ORDER_STATUS.PICKED_UP]);
  for (const status of [ORDER_STATUS.PENDING, ORDER_STATUS.AWAITING_PAYMENT, ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED]) {
    assert.equal(TRACKABLE_ORDER_STATUSES.includes(status), false);
  }
});
