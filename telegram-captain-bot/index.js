'use strict';
const { createWebhookServer } = require('./src/webhook');
const { createTelegramClient, handleUpdate } = require('./src/telegram');
const { deliverEvent } = require('./src/captainOrders');

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) { console.error('TELEGRAM_BOT_TOKEN is required'); process.exit(1); }

const port = Number(process.env.PORT || 8098);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
  console.error('PORT must be between 1 and 65535');
  process.exit(1);
}

const client = createTelegramClient(token);
let server;
try {
  server = createWebhookServer({
    secret: process.env.TELEGRAM_WEBHOOK_SECRET,
    processUpdate: (update) => handleUpdate(update, client),
    bridgeSecret: process.env.TELEGRAM_PAIRING_BRIDGE_SECRET,
    deliverOrderEvent: (event) => deliverEvent(event, client),
  });
} catch (error) {
  console.error('Telegram webhook configuration error:', error.message);
  process.exit(1);
}

server.on('error', (error) => {
  console.error('Telegram webhook listen failed:', error.message);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log('Telegram captain webhook listening on ' + port);
});
