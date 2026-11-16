'use strict';
const { createHash, randomUUID } = require('node:crypto');
const Delivery = require('../models/TelegramCaptainDelivery');

const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
const LEASE_MS = 60 * 1000;
function eventKey({ captainId, orderId, kind, status }) {
  if (!/^[a-f0-9]{24}$/i.test(String(captainId)) ||
      !/^[a-f0-9]{24}$/i.test(String(orderId)) ||
      !['assigned', 'status'].includes(kind) ||
      !['assigned', 'accepted', 'picked_up', 'delivered', 'cancelled'].includes(status)) {
    throw new Error('Invalid Telegram delivery event');
  }
  return createHash('sha256').update(
    [String(captainId).toLowerCase(), String(orderId).toLowerCase(), kind, status].join(':')
  ).digest('hex');
}

// Unique Mongo keys prevent parallel sends and survive backend restarts.
// This is at-most-one *confirmed* delivery per key while the record exists,
// NOT exactly-once: a Telegram timeout can occur after Telegram accepted a send,
// and a process crash before the receipt is stored can allow a retry.
async function sendOnce(event, send, { model = Delivery, now = Date.now } = {}) {
  const key = eventKey(event);
  const token = randomUUID();
  const time = now();
  const until = new Date(time + LEASE_MS);
  const expiry = new Date(time + RETENTION_MS);
  let claimed = false;
  try {
    await model.create({
      key, state: 'sending', leaseToken: token, leaseUntil: until, expiresAt: expiry,
    });
    claimed = true;
  } catch (error) {
    if (error?.code !== 11000) throw error;
  }
  if (!claimed) {
    const existing = await model.findOne({ key }).lean();
    if (!existing) return { status: 'in-flight' }; // deletion race; retry later
    if (existing.state === 'sent') return { status: 'duplicate' };
    if (!existing.leaseUntil || existing.leaseUntil > new Date(time)) {
      return { status: 'in-flight' };
    }
    const recovered = await model.findOneAndUpdate(
      { key, state: 'sending', leaseUntil: { $lte: new Date(time) } },
      { $set: { leaseToken: token, leaseUntil: until, expiresAt: expiry } },
      { new: true }
    ).lean();
    if (!recovered) return { status: 'in-flight' };
  }
  try {
    await send();
    const updated = await model.updateOne(
      { key, state: 'sending', leaseToken: token },
      { $set: { state: 'sent', sentAt: new Date(now()), expiresAt: new Date(now() + RETENTION_MS) },
        $unset: { leaseToken: '', leaseUntil: '' } }
    );
    if (updated.matchedCount !== 1) throw new Error('Telegram delivery lease changed');
    return { status: 'sent' };
  } catch (error) {
    // Errors are retryable, but Telegram may already have accepted the message.
    await model.deleteOne({ key, state: 'sending', leaseToken: token }).catch(() => {});
    throw error;
  }
}
module.exports = { sendOnce, eventKey, RETENTION_MS, LEASE_MS };
