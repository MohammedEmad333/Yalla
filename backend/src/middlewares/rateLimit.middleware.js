'use strict';

/**
 * محدّد معدّل بسيط بنافذة ثابتة في الذاكرة (بلا تبعيات خارجية).
 * مناسب لخادم واحد؛ في نشر موزّع يُستبدل بمخزن مشترك (Redis).
 * المنطق الأساسي في صنف نقيّ (يُحقن الوقت) ليكون قابلًا للاختبار.
 */
class RateLimiter {
  constructor({ windowMs, max }) {
    this.windowMs = windowMs; // مدّة النافذة بالملّي ثانية
    this.max = max;           // أقصى عدد طلبات في النافذة
    this.hits = new Map();    // key -> { start, count }
  }

  // فحص طلب لمفتاح معيّن (عادةً IP)؛ الوقت يُحقن لسهولة الاختبار
  check(key, now = Date.now()) {
    const entry = this.hits.get(key);

    // نافذة جديدة (أوّل طلب أو انتهت النافذة السابقة)
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

// مصنع Middleware لتطبيق الحدّ على مسارات معيّنة
function rateLimit({ windowMs = 60_000, max = 60 } = {}) {
  const limiter = new RateLimiter({ windowMs, max });

  return (req, res, next) => {
    const key = req.ip || req.socket?.remoteAddress || 'unknown';
    const result = limiter.check(key);

    if (!result.allowed) {
      res.set('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
      return res.status(429).json({ message: 'محاولات كثيرة جدًا، حاول لاحقًا' });
    }
    next();
  };
}

module.exports = { RateLimiter, rateLimit };
