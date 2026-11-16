'use strict';

// Small, bounded retries for transient send failures. The outer durable lease
// remains the authority on deduplication. No raw Telegram responses are logged.
const MAX_DELAY_MS = 1200;
const MAX_ATTEMPTS = 2;
function retryDelay(response, body) {
  const raw = body?.parameters?.retry_after;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0 && seconds <= MAX_DELAY_MS / 1000) {
    return Math.round(seconds * 1000);
  }
  const header = response.headers?.get?.('retry-after');
  const parsed = Number(header);
  if (Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_DELAY_MS / 1000) {
    return Math.round(parsed * 1000);
  }
  return MAX_DELAY_MS;
}
async function sendTelegramMessage(token, payload, {
  fetchImpl = fetch,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  onRetry = async () => {},
} = {}) {
  if (!token || typeof token !== 'string') throw new Error('Telegram token not configured');
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let response;
    try {
      response = await fetchImpl('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...payload, disable_web_page_preview: true, protect_content: true }),
        signal: AbortSignal.timeout(4500),
      });
    } catch (error) {
      // Unknown outcome (Telegram may have accepted the message). Do not
      // immediately resend it; let the existing durable lease govern retry.
      throw new Error('Telegram notification transport failure', { cause: error });
    }
    let body = null;
    try { body = await response.json(); } catch { /* malformed response */ }
    if (response.ok && body?.ok === true) return body.result;
    const code = Number(body?.error_code) || response.status;
    if (code === 429 && attempt < MAX_ATTEMPTS) {
      // A short retry is safe within the lease; large retry_after values are
      // left for a later durable retry, never sleep indefinitely in a request.
      const delay = retryDelay(response, body);
      const specified = Number(body?.parameters?.retry_after);
      if (Number.isFinite(specified) && specified > MAX_DELAY_MS / 1000) {
        const e = new Error('Telegram notification HTTP 429 (rate limited)');
        e.code = 'TELEGRAM_RATE_LIMITED';
        throw e;
      }
      await onRetry();
      await sleep(delay);
      continue;
    }
    if (code === 429) {
      const e = new Error('Telegram notification HTTP 429 (rate limited)');
      e.code = 'TELEGRAM_RATE_LIMITED';
      throw e;
    }
    // Never leak Telegram's response body, recipient, or bot token.
    throw new Error('Telegram notification HTTP ' + (response.status || 'error'));
  }
}
module.exports = { sendTelegramMessage, retryDelay, MAX_ATTEMPTS, MAX_DELAY_MS };
