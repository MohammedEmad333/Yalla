'use strict';
const { ROOMS } = require('./constants');

async function hasActiveCaptainSockets(io, captainId) {
  const sockets = await io.in(ROOMS.captain(captainId)).fetchSockets();
  return sockets.length > 0;
}
module.exports = { hasActiveCaptainSockets };
