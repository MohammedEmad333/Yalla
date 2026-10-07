'use strict';

const env = require('../config/env');
const { RedisFixedWindowStore } = require('../services/redisRateLimitStore');

/**
 * محدّد معدّل محلي بنافذة ثابتة. يبقى كـ fallback عند تعذّر Redis حتى لا تتحول
 * مشكلة مخزن المعدّل إلى انقطاع كامل للـ API، ويُستخدم مباشرةً في اختبارات الوحدة.
 */
class RateLimiter {
  constructor({ windowMs, max }) {
    this.windowMs = windowMs;
    this.max = max;
    this.hits = new Map();
    this.lastSweepAt = 0;
  }

  sweep(now) {
    if (now - this.lastSweepAt < this.windowMs) return;
    this.lastSweepAt = now;
    for (const [key, entry] of this.hits.entries()) {
      if (now - entry.start >= this.windowMs) this.hits.delete(key);
    }
  }

  check(key, now = Date.now()) {
    this.sweep(now);
    const entry = this.hits.get(key);

    if (!entry || now - entry.start >= this.windowMs) {
      this.hits.set(key, { start: now, count: 1 });
      return { allowed: true, remaining: this.max - 1 };
    }

    entry.count += 1;
    if (entry.count > this.max) {
      return { allowed: false, remaining: 0, retryAfterMs: this.windowMs - (now - entry.start) };
    }
    return { allowed: true, remaining: this.max - entry.count };
  }
}

let sharedStore;
let lastRedisWarningAt = 0;

function getSharedStore() {
  if (!env.redisUrl) return null;
  if (!sharedStore) sharedStore = new RedisFixedWindowStore(env.redisUrl);
  return sharedStore;
}

function warnRedisFallback(error) {
  const now = Date.now();
  if (now - lastRedisWarningAt < 60_000) return;
  lastRedisWarningAt = now;
  console.warn('[rate-limit] Redis unavailable; using per-process fallback:', error?.message || error);
}

function defaultKeyGenerator(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function normalizeKey(value) {
  const key = String(value ?? 'unknown').trim();
  return (key || 'unknown').slice(0, 256);
}

function applyHeaders(res, max, result) {
  res.set('X-RateLimit-Limit', String(max));
  res.set('X-RateLimit-Remaining', String(Math.max(0, result.remaining)));
  if (!result.allowed) {
    res.set('Retry-After', String(Math.max(1, Math.ceil((result.retryAfterMs || 1000) / 1000))));
  }
}

function rateLimit({
  windowMs = 60_000,
  max = 60,
  namespace = 'default',
  keyGenerator = defaultKeyGenerator,
  store,
} = {}) {
  const localLimiter = new RateLimiter({ windowMs, max });
  const configuredStore = store === undefined ? getSharedStore() : store;

  return async (req, res, next) => {
    let key;
    try {
      key = normalizeKey(keyGenerator(req));
    } catch {
      key = normalizeKey(defaultKeyGenerator(req));
    }

    let result;
    if (configuredStore) {
      try {
        result = await configuredStore.check(key, { windowMs, max, namespace });
      } catch (error) {
        warnRedisFallback(error);
        result = localLimiter.check(key);
      }
    } else {
      result = localLimiter.check(key);
    }

    applyHeaders(res, max, result);
    if (!result.allowed) {
      return res.status(429).json({ message: 'محاولات كثيرة جدًا، حاول لاحقًا' });
    }
    return next();
  };
}

module.exports = { RateLimiter, rateLimit, normalizeKey };
