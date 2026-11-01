'use strict';
const { createServer } = require('node:http');
const { secretMatches } = require('./src/security');
const { createTelegramClient, handleUpdate } = require('./src/telegram');
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) { console.error('TELEGRAM_BOT_TOKEN is required'); process.exit(1); }
const client = createTelegramClient(token);
const port = Number(process.env.PORT || 8098);
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
if (!secret || !/^[A-Za-z0-9_-]{1,256}$/.test(secret)) { console.error('Valid TELEGRAM_WEBHOOK_SECRET is required'); process.exit(1); }
createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') { res.writeHead(200); res.end('ok'); return; }
  if (req.method !== 'POST' || req.url !== '/telegram/webhook') { res.writeHead(404); res.end(); return; }
  if (!secretMatches(req.headers['x-telegram-bot-api-secret-token'], secret)) { res.writeHead(403); res.end(); return; }
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 65536) { res.writeHead(413); res.end(); return; } chunks.push(chunk); }
  const body = Buffer.concat(chunks).toString('utf8');
  let update; try { update = JSON.parse(body); } catch { res.writeHead(400); res.end(); return; }
  if (!update || !Number.isSafeInteger(update.update_id)) { res.writeHead(400); res.end(); return; }
  res.writeHead(200); res.end('ok');
  handleUpdate(update, client).catch(err => console.error('Telegram update failed:', err.message));
}).listen(port, '127.0.0.1', () => console.log('Telegram captain webhook listening on '+port));

module.exports = { secretMatches };
