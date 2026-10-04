'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { notFound, errorHandler } = require('../src/middlewares/error.middleware');

test('404 response omits query string values', async () => {
  const app = express();
  app.use(notFound);

  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/missing?token=super-secret`);
    const body = await res.json();
    assert.equal(res.status, 404);
    assert.equal(body.message, 'المسار غير موجود: /missing');
    assert.equal(JSON.stringify(body).includes('super-secret'), false);
  } finally {
    server.close();
  }
});

test('500 response does not expose internal error message', async () => {
  const app = express();
  app.get('/boom', () => {
    const err = new Error('mongodb://user:password@db/internal collection failure');
    throw err;
  });
  app.use(errorHandler);

  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/boom`);
    const body = await res.json();
    assert.equal(res.status, 500);
    assert.equal(body.message, 'خطأ داخلي في الخادم');
    assert.equal(JSON.stringify(body).includes('password'), false);
  } finally {
    server.close();
  }
});

test('explicit client errors may keep safe messages', async () => {
  const app = express();
  app.get('/bad', () => {
    const err = new Error('بيانات غير صالحة');
    err.statusCode = 400;
    throw err;
  });
  app.use(errorHandler);

  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/bad`);
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.equal(body.message, 'بيانات غير صالحة');
  } finally {
    server.close();
  }
});
