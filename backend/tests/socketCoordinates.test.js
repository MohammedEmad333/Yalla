'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validCoordinates } = require('../src/sockets/order.socket');

test('GPS accepts real numerical coordinates including zero', () => {
  assert.equal(validCoordinates(34.46, 31.5), true);
  assert.equal(validCoordinates('34.46', '31.5'), true);
  assert.equal(validCoordinates(0, 0), true);
});

test('GPS rejects empty, missing or non-numeric data', () => {
  for (const value of ['', '   ', null, undefined, {}, [], true, 'NaN', Infinity]) {
    assert.equal(validCoordinates(value, 31.5), false);
    assert.equal(validCoordinates(34.46, value), false);
  }
});

test('GPS rejects coordinates outside longitude/latitude boundaries', () => {
  assert.equal(validCoordinates(181, 0), false);
  assert.equal(validCoordinates(0, -91), false);
});
