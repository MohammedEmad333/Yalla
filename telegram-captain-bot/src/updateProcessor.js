'use strict';

// Telegram can retry the same update. Coalesce concurrent retries, cache only
// completed updates, and forget failed ones so Telegram can retry.
function createUpdateProcessor(handler, { ttlMs = 10 * 60 * 1000, maxEntries = 4096, maxInFlight = 64, now = Date.now } = {}) {
  if (typeof handler !== 'function') throw new TypeError('An update handler is required');
  if (!Number.isSafeInteger(maxInFlight) || maxInFlight < 1) {
    throw new RangeError('maxInFlight must be a positive integer');
  }
  const completed = new Map();
  const inFlight = new Map();

  return function processOnce(update) {
    const id = update.update_id;
    const currentTime = now();
    for (const [key, expiresAt] of completed) {
      if (expiresAt <= currentTime) completed.delete(key);
    }
    if (completed.has(id)) return Promise.resolve();
    if (inFlight.has(id)) return inFlight.get(id);
    // Telegram will retry a distinct update when this process is saturated.
    // Keep existing in-flight duplicates coalesced even at the limit.
    if (inFlight.size >= maxInFlight) {
      return Promise.reject(new Error('Telegram webhook busy'));
    }

    const work = (async () => {
      await handler(update);
      completed.set(id, now() + ttlMs);
      while (completed.size > maxEntries) completed.delete(completed.keys().next().value);
    })();
    inFlight.set(id, work);
    // Attach a rejection handler to the cleanup chain; callers receive the
    // original rejection and the webhook returns non-2xx for Telegram retry.
    work.finally(() => inFlight.delete(id)).catch(() => {});
    return work;
  };
}

module.exports = { createUpdateProcessor };
