'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validGeoPoint } = require('../src/utils/geoPoint');
test('dispatch accepts finite [longitude, latitude]', () => {
  assert.equal(validGeoPoint([34.47,31.5]),true);
  assert.equal(validGeoPoint([0,0]),true);
  assert.equal(validGeoPoint([-180,90]),true);
});
test('dispatch rejects malformed and out-of-range pickup coordinates', () => {
  for(const value of [null,undefined,[],[34.4],[34.4,31.5,0],['34.4',31.5],[NaN,0],[Infinity,0],[181,0],[0,-91],[null,0]]){
    assert.equal(validGeoPoint(value),false);
  }
});
