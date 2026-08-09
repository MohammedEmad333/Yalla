'use strict';

// اختبارات وحدة لمواصفة OpenAPI — تتحقّق من سلامة البنية بلا قاعدة بيانات.

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildOpenApiSpec } = require('../src/docs/openapi');

const spec = buildOpenApiSpec();

test('openapi: إصدار ومعلومات صحيحة', () => {
  assert.match(spec.openapi, /^3\./);
  assert.equal(spec.info.title, 'Yalla API');
  assert.ok(spec.info.version);
});

test('openapi: يعرّف مخطّط أمان bearer', () => {
  assert.equal(spec.components.securitySchemes.bearerAuth.scheme, 'bearer');
});

test('openapi: يحتوي مسارات غير فارغة', () => {
  assert.ok(Object.keys(spec.paths).length > 15);
});

test('openapi: كل عملية لها summary و tags و responses', () => {
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      assert.ok(op.summary, `${method} ${path} بلا summary`);
      assert.ok(Array.isArray(op.tags) && op.tags.length, `${method} ${path} بلا tags`);
      assert.ok(op.responses && op.responses[200], `${method} ${path} بلا استجابة 200`);
    }
  }
});

test('openapi: مسارات المصادقة العامّة بلا security', () => {
  assert.equal(spec.paths['/auth/login'].post.security, undefined);
  assert.equal(spec.paths['/auth/register'].post.security, undefined);
});

test('openapi: المسارات المحميّة تتطلّب bearerAuth', () => {
  assert.deepEqual(spec.paths['/orders/mine'].get.security, [{ bearerAuth: [] }]);
});
