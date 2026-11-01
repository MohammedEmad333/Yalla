'use strict';
const { createServer } = require('node:http');
const { createTelegramClient, handleUpdate } = require('./src/telegram');
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) { console.error('TELEGRAM_BOT_TOKEN is required'); process.exit(1); }
const client = createTelegramClient(token);
const port = Number(process.env.PORT || 8098);
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!secret) { console.error('TELEGRAM_WEBHOOK_SECRET is required'); process.exit(1); }
createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') { res.writeHead(200); res.end('ok'); return; }
  if (req.method !== 'POST' || req.url !== '/telegram/webhook') { res.writeHead(404); res.end(); return; }
  if (req.headers['x-telegram-bot-api-secret-token'] !== secret) { res.writeHead(403); res.end(); return; }
  let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 65536) { res.writeHead(413); res.end(); return; } }
  let update; try { update = JSON.parse(body); } catch { res.writeHead(400); res.end(); return; }
  res.writeHead(200); res.end('ok');
  handleUpdate(update, client).catch(err => console.error('Telegram update failed:', err.message));
}).listen(port, '127.0.0.1', () => console.log('Telegram captain webhook listening on '+port));
