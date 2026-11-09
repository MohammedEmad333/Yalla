'use strict';
const { createServer } = require('node:http');
const { secretMatches } = require('./security');
const { createUpdateProcessor } = require('./updateProcessor');
const { makeEventHandler } = require('./eventServer');

function createWebhookServer({ secret, processUpdate, bridgeSecret, deliverOrderEvent, logger = console }) {
  if (typeof secret !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) {
    throw new Error('TELEGRAM_WEBHOOK_SECRET must be 32-256 allowed ASCII characters');
  }
  const processOnce = createUpdateProcessor(processUpdate);
  const handleEvent = deliverOrderEvent ? makeEventHandler({ secret: bridgeSecret, deliver: deliverOrderEvent, logger }) : null;

  return createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200); res.end('ok'); return;
    }
    if (req.method === 'POST' && req.url === '/internal/order-event' && handleEvent) {
      await handleEvent(req, res); return;
    }
    if (req.method !== 'POST' || req.url !== '/telegram/webhook') {
      res.writeHead(404); res.end(); return;
    }
    if (!secretMatches(req.headers['x-telegram-bot-api-secret-token'], secret)) {
      res.writeHead(403); res.end(); return;
    }

    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 65536) {
          res.writeHead(413); res.end(); return;
        }
        chunks.push(chunk);
      }
      let update;
      try {
        update = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        res.writeHead(400); res.end(); return;
      }
      if (!update || !Number.isSafeInteger(update.update_id) || update.update_id < 0) {
        res.writeHead(400); res.end(); return;
      }

      // Acknowledge ONLY after successful processing. Non-2xx enables Telegram
      // retries after transient API errors instead of silently losing updates.
      await processOnce(update);
      res.writeHead(200); res.end('ok');
    } catch (error) {
      logger.error('Telegram update processing failed:', error?.message || 'unknown error');
      if (!res.headersSent) res.writeHead(503);
      if (!res.writableEnded) res.end('Retry later');
    }
  });
}

module.exports = { createWebhookServer };
