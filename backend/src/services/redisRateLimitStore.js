'use strict';

const crypto = require('crypto');
const net = require('net');

const FIXED_WINDOW_SCRIPT = [
  "local count = redis.call('INCR', KEYS[1])",
  "if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end",
  "local ttl = redis.call('PTTL', KEYS[1])",
  'return {count, ttl}',
].join('\n');

function encodeCommand(args) {
  const chunks = [Buffer.from(`*${args.length}\r\n`)];
  for (const arg of args) {
    const value = Buffer.from(String(arg));
    chunks.push(Buffer.from(`$${value.length}\r\n`), value, Buffer.from('\r\n'));
  }
  return Buffer.concat(chunks);
}

function readLine(buffer, offset) {
  const end = buffer.indexOf('\r\n', offset);
  if (end === -1) return null;
  return { text: buffer.toString('utf8', offset, end), next: end + 2 };
}

function parseResp(buffer, offset = 0) {
  if (offset >= buffer.length) return null;
  const type = String.fromCharCode(buffer[offset]);
  const line = readLine(buffer, offset + 1);
  if (!line) return null;

  if (type === '+' || type === ':' || type === '-') {
    if (type === '-') return { error: new Error(`Redis error: ${line.text}`), next: line.next };
    return { value: type === ':' ? Number(line.text) : line.text, next: line.next };
  }

  if (type === '$') {
    const length = Number(line.text);
    if (length === -1) return { value: null, next: line.next };
    const end = line.next + length;
    if (buffer.length < end + 2) return null;
    return { value: buffer.toString('utf8', line.next, end), next: end + 2 };
  }

  if (type === '*') {
    const length = Number(line.text);
    if (length === -1) return { value: null, next: line.next };
    const values = [];
    let next = line.next;
    for (let i = 0; i < length; i += 1) {
      const item = parseResp(buffer, next);
      if (!item) return null;
      if (item.error) return item;
      values.push(item.value);
      next = item.next;
    }
    return { value: values, next };
  }

  throw new Error(`Unsupported Redis RESP type: ${type}`);
}

class RedisClient {
  constructor(redisUrl, { timeoutMs = 1500 } = {}) {
    const url = new URL(redisUrl);
    if (url.protocol !== 'redis:') throw new Error('REDIS_URL must use redis://');
    if (url.username || url.password) {
      throw new Error('Credentialed REDIS_URL is not supported; keep Redis bound to localhost/private network');
    }
    const db = (url.pathname || '/0').replace(/^\//, '') || '0';
    if (db !== '0') throw new Error('Only Redis database 0 is supported');

    this.host = url.hostname || '127.0.0.1';
    this.port = Number(url.port || 6379);
    this.timeoutMs = timeoutMs;
    this.socket = null;
    this.connecting = null;
    this.pending = [];
    this.buffer = Buffer.alloc(0);
  }

  _rejectPending(error) {
    const pending = this.pending.splice(0);
    for (const item of pending) item.reject(error);
  }

  _dropSocket(error) {
    const socket = this.socket;
    this.socket = null;
    this.connecting = null;
    this.buffer = Buffer.alloc(0);
    if (socket && !socket.destroyed) socket.destroy();
    this._rejectPending(error || new Error('Redis connection closed'));
  }

  _consume() {
    while (this.pending.length) {
      let parsed;
      try {
        parsed = parseResp(this.buffer);
      } catch (error) {
        this._dropSocket(error);
        return;
      }
      if (!parsed) return;
      this.buffer = this.buffer.subarray(parsed.next);
      const waiter = this.pending.shift();
      if (parsed.error) waiter.reject(parsed.error);
      else waiter.resolve(parsed.value);
    }
  }

  async _ensureConnected() {
    if (this.socket && !this.socket.destroyed && this.socket.writable) return;
    if (this.connecting) return this.connecting;

    this.connecting = new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      this.socket = socket;
      socket.setNoDelay(true);
      socket.setTimeout(this.timeoutMs);

      socket.on('data', (chunk) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        this._consume();
      });
      socket.on('timeout', () => this._dropSocket(new Error('Redis connection timed out')));
      socket.on('error', (error) => {
        if (this.connecting) reject(error);
        this._dropSocket(error);
      });
      socket.on('close', () => {
        if (this.socket === socket) this._dropSocket(new Error('Redis connection closed'));
      });
      socket.once('connect', () => {
        this.connecting = null;
        resolve();
      });
    });

    try {
      await this.connecting;
    } catch (error) {
      this.connecting = null;
      if (this.socket && !this.socket.destroyed) this.socket.destroy();
      this.socket = null;
      throw error;
    }
  }

  async command(args) {
    await this._ensureConnected();
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject };
      this.pending.push(waiter);
      this.socket.write(encodeCommand(args), (error) => {
        if (!error) return;
        const index = this.pending.indexOf(waiter);
        if (index !== -1) this.pending.splice(index, 1);
        reject(error);
        this._dropSocket(error);
      });
    });
  }

  close() {
    this._dropSocket(new Error('Redis client closed'));
  }
}

class RedisFixedWindowStore {
  constructor(redisUrl, { prefix = 'yalla:ratelimit', client } = {}) {
    this.client = client || new RedisClient(redisUrl);
    this.prefix = prefix;
  }

  async check(key, { windowMs, max, namespace = 'default' }) {
    const safeNamespace = String(namespace).replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 80) || 'default';
    const digest = crypto.createHash('sha256').update(String(key)).digest('hex');
    const redisKey = `${this.prefix}:${safeNamespace}:${digest}`;
    const result = await this.client.command([
      'EVAL',
      FIXED_WINDOW_SCRIPT,
      '1',
      redisKey,
      String(windowMs),
    ]);

    if (!Array.isArray(result) || result.length < 2) throw new Error('Invalid Redis rate-limit response');
    const count = Number(result[0]);
    const ttl = Math.max(1, Number(result[1]) || windowMs);
    return {
      allowed: count <= max,
      remaining: Math.max(0, max - count),
      retryAfterMs: count > max ? ttl : undefined,
    };
  }
}

module.exports = {
  FIXED_WINDOW_SCRIPT,
  RedisClient,
  RedisFixedWindowStore,
  encodeCommand,
  parseResp,
};
