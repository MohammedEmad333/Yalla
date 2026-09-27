'use strict';

const net = require('node:net');
const tls = require('node:tls');
const os = require('node:os');
const env = require('../config/env');

const DEFAULT_TIMEOUT_MS = 15_000;

function isConfigured() {
  return Boolean(env.smtp.host && env.smtp.port && env.smtp.user && env.smtp.pass && env.smtp.fromEmail);
}

function sanitizeHeader(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function encodeHeader(value) {
  const text = sanitizeHeader(value);
  if (/^[\x20-\x7E]*$/.test(text)) return text;
  return `=?UTF-8?B?${Buffer.from(text, 'utf8').toString('base64')}?=`;
}

function wrapBase64(value, width = 76) {
  const encoded = Buffer.from(String(value || ''), 'utf8').toString('base64');
  return encoded.match(new RegExp(`.{1,${width}}`, 'g'))?.join('\r\n') || '';
}

function buildMessage({ to, subject, html, text }) {
  const boundary = `yalla-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const fromName = encodeHeader(env.smtp.fromName);
  const safeTo = sanitizeHeader(to);
  const safeSubject = encodeHeader(subject);
  const plain = text || String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  return [
    `From: ${fromName} <${env.smtp.fromEmail}>`,
    `To: <${safeTo}>`,
    `Subject: ${safeSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(plain),
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(html || plain),
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

function dotStuff(message) {
  return message
    .replace(/\r?\n/g, '\r\n')
    .replace(/(^|\r\n)\./g, '$1..');
}

class SmtpSession {
  constructor(socket, timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.socket = socket;
    this.timeoutMs = timeoutMs;
    this.buffer = '';
    this.waiters = [];
    this.closedError = null;

    socket.setEncoding('utf8');
    socket.setTimeout(timeoutMs, () => socket.destroy(new Error('SMTP connection timed out')));
    socket.on('data', (chunk) => {
      this.buffer += chunk;
      this.flush();
    });
    socket.on('error', (err) => {
      this.closedError = err;
      this.flush();
    });
    socket.on('close', () => {
      if (!this.closedError) this.closedError = new Error('SMTP connection closed unexpectedly');
      this.flush();
    });
  }

  replaceSocket(socket) {
    this.socket.removeAllListeners();
    this.socket = socket;
    this.buffer = '';
    this.closedError = null;
    socket.setEncoding('utf8');
    socket.setTimeout(this.timeoutMs, () => socket.destroy(new Error('SMTP connection timed out')));
    socket.on('data', (chunk) => {
      this.buffer += chunk;
      this.flush();
    });
    socket.on('error', (err) => {
      this.closedError = err;
      this.flush();
    });
    socket.on('close', () => {
      if (!this.closedError) this.closedError = new Error('SMTP connection closed unexpectedly');
      this.flush();
    });
  }

  readResponse() {
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
      this.flush();
    });
  }

  flush() {
    if (!this.waiters.length) return;
    if (this.closedError) {
      const waiters = this.waiters.splice(0);
      for (const waiter of waiters) waiter.reject(this.closedError);
      return;
    }

    const lines = this.buffer.split('\r\n');
    if (lines.length < 2) return;

    let endIndex = -1;
    let code = null;
    for (let i = 0; i < lines.length - 1; i += 1) {
      const match = lines[i].match(/^(\d{3})([ -])/);
      if (!match) continue;
      if (code === null) code = match[1];
      if (match[1] === code && match[2] === ' ') {
        endIndex = i;
        break;
      }
    }
    if (endIndex < 0) return;

    const responseLines = lines.slice(0, endIndex + 1);
    this.buffer = lines.slice(endIndex + 1).join('\r\n');
    const waiter = this.waiters.shift();
    waiter.resolve({
      code: Number(code),
      text: responseLines.join('\n'),
    });
    this.flush();
  }

  async command(command, expectedCodes) {
    if (command !== null) this.socket.write(`${command}\r\n`);
    const response = await this.readResponse();
    const allowed = Array.isArray(expectedCodes) ? expectedCodes : [expectedCodes];
    if (!allowed.includes(response.code)) {
      throw new Error(`SMTP command failed (${response.code}): ${response.text}`);
    }
    return response;
  }

  close() {
    try {
      this.socket.end();
    } catch {
      // no-op
    }
  }
}

function connectPlain(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    const onError = (err) => {
      socket.removeListener('connect', onConnect);
      reject(err);
    };
    const onConnect = () => {
      socket.removeListener('error', onError);
      resolve(socket);
    };
    socket.once('error', onError);
    socket.once('connect', onConnect);
    socket.setTimeout(timeoutMs, () => socket.destroy(new Error('SMTP connection timed out')));
  });
}

function upgradeTls(socket, host, timeoutMs) {
  return new Promise((resolve, reject) => {
    const secureSocket = tls.connect({
      socket,
      servername: host,
      minVersion: 'TLSv1.2',
    });
    const onError = (err) => {
      secureSocket.removeListener('secureConnect', onSecure);
      reject(err);
    };
    const onSecure = () => {
      secureSocket.removeListener('error', onError);
      resolve(secureSocket);
    };
    secureSocket.once('error', onError);
    secureSocket.once('secureConnect', onSecure);
    secureSocket.setTimeout(timeoutMs, () => secureSocket.destroy(new Error('SMTP TLS timed out')));
  });
}

async function sendMail({ to, subject, html, text, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (!isConfigured()) {
    throw new Error('SMTP is not configured. Set SMTP_USER and SMTP_PASS on the server.');
  }
  if (!to || !subject || (!html && !text)) {
    throw new Error('Email requires to, subject, and html or text content');
  }

  let session;
  try {
    const socket = await connectPlain(env.smtp.host, env.smtp.port, timeoutMs);
    session = new SmtpSession(socket, timeoutMs);

    await session.command(null, 220);
    await session.command(`EHLO ${os.hostname() || 'yalladelivery.org'}`, 250);
    await session.command('STARTTLS', 220);

    const secureSocket = await upgradeTls(session.socket, env.smtp.host, timeoutMs);
    session.replaceSocket(secureSocket);

    await session.command(`EHLO ${os.hostname() || 'yalladelivery.org'}`, 250);

    const auth = Buffer.from(`\u0000${env.smtp.user}\u0000${env.smtp.pass}`).toString('base64');
    await session.command(`AUTH PLAIN ${auth}`, 235);

    await session.command(`MAIL FROM:<${env.smtp.fromEmail}>`, 250);
    await session.command(`RCPT TO:<${sanitizeHeader(to)}>`, [250, 251]);
    await session.command('DATA', 354);

    const message = dotStuff(buildMessage({ to, subject, html, text }));
    session.socket.write(`${message}\r\n.\r\n`);
    const accepted = await session.readResponse();
    if (accepted.code !== 250) {
      throw new Error(`SMTP DATA rejected (${accepted.code}): ${accepted.text}`);
    }

    try {
      await session.command('QUIT', 221);
    } catch {
      // الرسالة قُبلت بالفعل؛ فشل QUIT لا يعني فشل الإرسال.
    }
    session.close();

    return { accepted: true, response: accepted.text };
  } catch (err) {
    if (session) session.close();
    throw err;
  }
}

module.exports = {
  isConfigured,
  sendMail,
};
