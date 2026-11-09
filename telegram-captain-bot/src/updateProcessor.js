'use strict';

// Telegram can retry the same update. Coalesce concurrent retries, cache only
// completed updates, and forget failed ones so Telegram can retry.
function createUpdateProcessor(handler, { ttlMs = 10 * 60 * 1000, maxEntries = 4096, now = Date.now } = {}) {
  if (typeof handler !== 'function') throw new TypeError('An update handler is required');
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
