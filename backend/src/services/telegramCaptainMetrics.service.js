'use strict';
const Metric = require('../models/TelegramCaptainMetric');
const Delivery = require('../models/TelegramCaptainDelivery');

const OUTCOMES = Object.freeze(['sent', 'duplicate', 'in_flight', 'failed', 'rate_limited', 'retried']);
const KINDS = Object.freeze(['assigned', 'status']);
const RETAIN_DAYS = 30;

async function record(kind, outcome, { model = Metric, now = Date.now } = {}) {
  if (!KINDS.includes(kind) || !OUTCOMES.includes(outcome)) {
    throw new TypeError('Invalid Telegram metric dimensions');
  }
  const time = new Date(now());
  const day = time.toISOString().slice(0, 10);
  const expiresAt = new Date(time.getTime() + RETAIN_DAYS * 86400000);
  // No event identifiers, text, request headers or customer data are persisted.
  await model.updateOne(
    { day, kind, outcome },
    { $inc: { count: 1 }, $max: { expiresAt }, $setOnInsert: { day, kind, outcome } },
    { upsert: true }
  );
}

async function recordBestEffort(kind, outcome, options = {}) {
  if (!options.model && Metric.db.readyState !== 1) return;
  try { await record(kind, outcome, options); }
  catch {
    // Metrics must never prevent a valid order notification from being sent.
    // The operation's result remains authoritative; dashboard can show incomplete data.
  }
}

async function snapshot({ model = Metric, deliveries = Delivery, now = Date.now, days = 7 } = {}) {
  if (!Number.isSafeInteger(days) || days < 1 || days > 30) {
    throw new RangeError('Invalid Telegram metric window');
  }
  const current = now();
  const start = new Date(current - (days - 1) * 86400000).toISOString().slice(0, 10);
  const rows = await model.find({ day: { $gte: start } })
    .select('day kind outcome count -_id').sort({ day: 1 }).lean();
  const counters = Object.fromEntries(OUTCOMES.map(key => [key, 0]));
  const byKind = Object.fromEntries(KINDS.map(kind => [kind, { ...counters }]));
  const daily = new Map();
  for (const item of rows) {
    if (!KINDS.includes(item.kind) || !OUTCOMES.includes(item.outcome) ||
        !Number.isFinite(item.count) || item.count < 0) continue;
    byKind[item.kind][item.outcome] += item.count;
    counters[item.outcome] += item.count;
    const bucket = daily.get(item.day) || { day: item.day, ...Object.fromEntries(OUTCOMES.map(k => [k, 0])) };
    bucket[item.outcome] += item.count;
    daily.set(item.day, bucket);
  }
  // Stale leases are candidates for safe retry, NOT proof of failed delivery.
  const stalled = await deliveries.countDocuments({
    state: 'sending', leaseUntil: { $lte: new Date(current) },
  });
  const attempts = counters.sent + counters.failed + counters.rate_limited;
  return {
    days, asOf: new Date(current).toISOString(), total: counters,
    byKind, daily: [...daily.values()], stalled,
    failureRatePercent: attempts ? Math.round((counters.failed + counters.rate_limited) / attempts * 10000) / 100 : 0,
    note: 'Best-effort aggregate metrics; failures may be undercounted. Stalled leases are not confirmed failed sends.',
  };
}

module.exports = { record, recordBestEffort, snapshot, KINDS, OUTCOMES };
