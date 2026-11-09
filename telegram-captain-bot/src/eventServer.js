'use strict';
const { secretMatches } = require('./security');
const { createEventProcessor } = require('./eventProcessor');
function validOrderEvent(x) {
  if (!x || typeof x !== 'object') return false;
  if (!['assigned', 'status'].includes(x.eventType)) return false;
  if (!['assigned', 'accepted', 'picked_up', 'delivered', 'cancelled'].includes(x.status)) return false;
  if (!/^[a-f0-9]{24}$/i.test(x.orderId || '') || !/^[a-f0-9]{24}$/i.test(x.captainId || '')) return false;
  if (typeof x.eventId !== 'string' || x.eventId.length > 140) return false;
  const prefix = x.orderId + ':' + x.eventType + ':' + x.status + ':';
  return x.eventId.startsWith(prefix) && /^[0-9]{1,14}$/.test(x.eventId.slice(prefix.length));
}
function makeEventHandler({ secret, deliver, logger = console }) {
  const process = createEventProcessor(deliver);
  return async function handleEvent(req, res) {
    if (!secret || secret.length < 32 || !secretMatches(req.headers['x-telegram-pairing-secret'], secret)) {
      res.writeHead(403); res.end(); return;
    }
    try {
      let size = 0;
      const parts = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 8192) { res.writeHead(413); res.end(); return; }
        parts.push(chunk);
      }
      let event;
      try { event = JSON.parse(Buffer.concat(parts).toString('utf8')); }
      catch { res.writeHead(400); res.end(); return; }
      if (!validOrderEvent(event)) { res.writeHead(400); res.end(); return; }
      await process(event);
      res.writeHead(200); res.end('ok');
    } catch (error) {
      logger.error('Telegram captain event failed:', error?.message || 'unknown');
      if (!res.headersSent) res.writeHead(503);
      if (!res.writableEnded) res.end('Retry later');
    }
  };
}
module.exports = { makeEventHandler, validOrderEvent };
