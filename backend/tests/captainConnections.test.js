'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { hasActiveCaptainSockets } = require('../src/utils/captainConnections');

test('preserves online state when captain retains another socket', async () => {
  let room;
  const io = { in: (name) => { room = name; return { fetchSockets: async () => [{ id: 'second-device' }] }; } };
  assert.equal(await hasActiveCaptainSockets(io, 'abc'), true);
  assert.equal(room, 'captain:abc');
});

test('permits offline transition when no captain sockets remain', async () => {
  const io = { in: () => ({ fetchSockets: async () => [] }) };
  assert.equal(await hasActiveCaptainSockets(io, 'abc'), false);
});
