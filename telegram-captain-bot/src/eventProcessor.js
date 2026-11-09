'use strict';
function createEventProcessor(handler, { ttlMs = 600000, maxEntries = 4096 } = {}) {
  const done = new Map(), active = new Map();
  return function process(event) {
    const now = Date.now();
    for (const [id, expiry] of done) if (expiry <= now) done.delete(id);
    if (done.has(event.eventId)) return Promise.resolve();
    if (active.has(event.eventId)) return active.get(event.eventId);
    const work = Promise.resolve().then(() => handler(event)).then(() => {
      done.set(event.eventId, Date.now() + ttlMs);
      while (done.size > maxEntries) done.delete(done.keys().next().value);
    });
    active.set(event.eventId, work);
    work.finally(() => active.delete(event.eventId)).catch(() => {});
    return work;
  };
}
module.exports = { createEventProcessor };
