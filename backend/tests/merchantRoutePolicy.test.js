'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('merchant routes apply explicit capability guards to sensitive surfaces', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/routes/merchant.routes.js'), 'utf8');
  for (const capability of ['branches','restaurant','menu','inventory','orders']) {
    assert.match(source, new RegExp(`requireMerchantCapability\\('${capability}'\\)`));
  }
});
