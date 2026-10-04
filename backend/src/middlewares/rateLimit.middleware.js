'use strict';

/**
 * محدّد معدّل بسيط بنافذة ثابتة في الذاكرة (بلا تبعيات خارجية).
 * مناسب لخادم واحد؛ في نشر موزّع يُستبدل بمخزن مشترك (Redis).
 * المنطق الأساسي في صنف نقيّ (يُحقن الوقت) ليكون قابلًا للاختبار.
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

  // فحص طلب لمفتاح معيّن؛ الوقت يُحقن لسهولة الاختبار.
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

function defaultKeyGenerator(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function normalizeKey(value) {
  const key = String(value ?? 'unknown').trim();
  return (key || 'unknown').slice(0, 256);
}

function rateLimit({ windowMs = 60_000, max = 60, keyGenerator = defaultKeyGenerator } = {}) {
  const limiter = new RateLimiter({ windowMs, max });

  return (req, res, next) => {
    let key;
    try {
      key = normalizeKey(keyGenerator(req));
    } catch {
      key = normalizeKey(defaultKeyGenerator(req));
    }
    const result = limiter.check(key);

    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(0, result.remaining)));

    if (!result.allowed) {
      res.set('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
      return res.status(429).json({ message: 'محاولات كثيرة جدًا، حاول لاحقًا' });
    }
    next();
  };
}

module.exports = { RateLimiter, rateLimit };
