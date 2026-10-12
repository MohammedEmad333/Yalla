'use strict';

// Missing, malformed and future timestamps must not count as fresh GPS data.
// Allow a small (30-second) clock skew between devices and the API server.
function locationAgeMinutes(updatedAt, now = Date.now()) {
  if (updatedAt === null || updatedAt === undefined || updatedAt === '') return Infinity;
  const timestamp = new Date(updatedAt).getTime();
  const clock = Number(now);
  if (!Number.isFinite(timestamp) || !Number.isFinite(clock)) return Infinity;
  const elapsedMs = clock - timestamp;
  if (elapsedMs < -30_000) return Infinity;
  return Math.max(0, elapsedMs / 60_000);
}
module.exports = { locationAgeMinutes };
