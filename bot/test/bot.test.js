const test = require('node:test');
const assert = require('node:assert/strict');

process.env.AI_ENABLED = 'false';
process.env.ADMIN_HTTP_TOKEN = 'test-admin-token-0123456789';
process.env.BUSINESS_NUMBER = '970593456405';
process.env.SUPPORT_NUMBER = '+970593456405';
process.env.ADMIN_NUMBERS = '970599999999';

const {
  handleMessage,
  resetSession,
  isAdmin,
  redactSensitiveText,
  activateHumanTakeover,
  isHumanTakeoverActive,
  resumeBotForChat,
  app,
} = require('../index');

test('admin matching requires the complete normalized international number', () => {
  assert.equal(isAdmin('970593456405'), true);
  assert.equal(isAdmin('+970593456405'), true);
  assert.equal(isAdmin('970599999999'), true);
  assert.equal(isAdmin('0593456405'), false);
  assert.equal(isAdmin('111970593456405'), false);
});

test('order intent routes customers to the official app instead of creating WhatsApp orders', async () => {
  const jid = '970500000001@s.whatsapp.net';
  resetSession(jid);
  const reply = await handleMessage(jid, '970500000001', 'بدي طلب جديد');
  assert.match(reply, /Yalla Delivery/i);
  assert.match(reply, /yalladelivery\.org\/android|app\.yalladelivery\.org/);
});

test('pricing supports Arabic menu digit and current minimum fare', async () => {
  const jid = '970500000002@s.whatsapp.net';
  resetSession(jid);
  const reply = await handleMessage(jid, '970500000002', '٢');
  assert.match(reply, /الحد الأدنى/);
  assert.match(reply, /8/);
});

test('admin commands reject non-admin callers', async () => {
  const jid = '970500000003@s.whatsapp.net';
  resetSession(jid);
  const reply = await handleMessage(jid, '970500000003', '/stats');
  assert.equal(reply, '🔒 هذا الأمر متاح للإدارة فقط.');
});

test('human takeover can be activated and resumed deterministically', () => {
  const jid = '970500000004@s.whatsapp.net';
  resetSession(jid);
  activateHumanTakeover(jid, 'test');
  assert.equal(isHumanTakeoverActive(jid), true);
  assert.equal(resumeBotForChat(jid), true);
  assert.equal(isHumanTakeoverActive(jid), false);
});

test('sensitive values are redacted before AI use', () => {
  const result = redactSensitiveText('رمز التحقق 123456 وهاتفي +970593456405 وبريدي user@example.com');
  assert.doesNotMatch(result, /123456/);
  assert.doesNotMatch(result, /970593456405/);
  assert.doesNotMatch(result, /user@example\.com/);
  assert.match(result, /REDACTED_CODE/);
  assert.match(result, /REDACTED_PHONE_OR_NUMBER/);
  assert.match(result, /REDACTED_EMAIL/);
});

test('admin HTTP endpoints require token and cached ai-status does not require a live AI call', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  const unauthorized = await fetch(`${base}/ai-status`);
  assert.equal(unauthorized.status, 401);

  const authorized = await fetch(`${base}/ai-status`, {
    headers: { Authorization: 'Bearer test-admin-token-0123456789' },
  });
  assert.equal(authorized.status, 200);
  const body = await authorized.json();
  assert.equal(body.ping.cached, true);

  const qrUnauthorized = await fetch(`${base}/qr`);
  assert.equal(qrUnauthorized.status, 401);
});
