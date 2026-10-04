'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { rateLimit } = require('../src/middlewares/rateLimit.middleware');

async function startApp(limiter) {
  const app = express();
  app.use(express.json());
  app.post('/check', limiter, (req, res) => res.json({ ok: true }));
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  return { server, port: server.address().port };
}

test('custom key generator limits the same logical identity across requests', async () => {
  const limiter = rateLimit({
    windowMs: 60_000,
    max: 2,
    keyGenerator: (req) => String(req.body?.email || '').trim().toLowerCase(),
  });
  const { server, port } = await startApp(limiter);
  try {
    const send = () => fetch(`http://127.0.0.1:${port}/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'User@Example.com' }),
    });
    assert.equal((await send()).status, 200);
    assert.equal((await send()).status, 200);
    const blocked = await send();
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.has('retry-after'), true);
  } finally {
    server.close();
  }
});

test('different identity keys keep separate counters', async () => {
  const limiter = rateLimit({
    windowMs: 60_000,
    max: 1,
    keyGenerator: (req) => req.body?.email,
  });
  const { server, port } = await startApp(limiter);
  try {
    const send = (email) => fetch(`http://127.0.0.1:${port}/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    assert.equal((await send('a@example.com')).status, 200);
    assert.equal((await send('b@example.com')).status, 200);
    assert.equal((await send('a@example.com')).status, 429);
  } finally {
    server.close();
  }
});
