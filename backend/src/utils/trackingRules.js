'use strict';
const { ORDER_STATUS } = require('./constants');
// Only live delivery stages are allowed to emit captain GPS for a customer order.
const TRACKABLE_ORDER_STATUSES = Object.freeze([
  ORDER_STATUS.ASSIGNED, ORDER_STATUS.ACCEPTED, ORDER_STATUS.PICKED_UP,
]);
module.exports = { TRACKABLE_ORDER_STATUSES };
