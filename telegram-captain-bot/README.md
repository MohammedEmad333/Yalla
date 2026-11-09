# Yalla Telegram Captain Bot

Standalone private-chat-only Telegram webhook service (Node.js 22+, no npm dependencies).

## Configuration

Set secrets in the deployment environment, never in git. The backend and bot must share the **same** TELEGRAM_PAIRING_BRIDGE_SECRET (at least 32 characters).

- TELEGRAM_BOT_TOKEN: Telegram BotFather token
- TELEGRAM_WEBHOOK_SECRET: Telegram webhook secret_token (1–256 ASCII letters, digits, underscores or hyphens)
- TELEGRAM_PAIRING_BRIDGE_SECRET: high-entropy service-to-service shared secret, on BOTH backend and bot
- YALLA_BACKEND_URL: backend origin (HTTPS or localhost HTTP), e.g. https://api.yalladelivery.org
- PORT: local webhook port (default 8098, bound to 127.0.0.1)

Run `node --test test/*.test.js` and `node index.js` from this directory. Configure the HTTPS reverse proxy for POST /telegram/webhook and register Telegram's setWebhook with secret_token. Do not expose port 8098 publicly.

## Account pairing

1. An authenticated, approved captain requests POST /api/telegram-captain/pairing-code using their captain JWT.
2. The backend returns a single-use code valid for five minutes.
3. The captain sends `/start CODE` in a **private** chat with the bot.
4. The bot calls POST /api/telegram-captain/internal/redeem with the shared secret. The backend validates, consumes and links the code.
5. An authenticated captain may revoke the link using DELETE /api/telegram-captain/link.

## Safety and rollout

- Never send passwords or OTPs to the bot.
- No order management, customer data access, or captain order actions are enabled yet.
- Configure and validate the backend bridge and webhook secrets before deploying.
- Telegram may retry deliveries. Account linking is single-use; future order actions require separate authorization and idempotency tests.
- Verify the real pairing flow with a test captain before enabling the bot publicly.

## Webhook reliability and duplicate deliveries (2026-11-09)

- The bot acknowledges Telegram updates with HTTP 200 **only after successful processing**.
- Transient Telegram/backend failures return 503 so Telegram can retry. Invalid/used codes receive a user-readable failure without retrying.
- Concurrent duplicate update IDs are coalesced and successfully completed IDs are remembered in a bounded, 10-minute in-memory cache. This is **not** a durable queue and cannot guarantee exactly-once delivery after a process restart.
- Repeated pairing with the same 32-character code, captain and private Telegram account safely returns success while the consumed pairing code remains valid; attempts from other accounts are still rejected.
- TELEGRAM_WEBHOOK_SECRET must now contain **32-256 allowed ASCII characters**. Coordinate changing this value in the bot environment and Telegram's setWebhook secret_token; deploy with a shorter existing secret will fail fast.
- Test locally with `npm test`. GitHub CI runs this suite independently of the WhatsApp bot.
- No customer order actions, payments or location sharing are added by this change.


## Captain read-only order alerts (phase 1)

- /orders and /myorders show at most five active orders for the paired captain.
- The refresh buttons query the backend on every press. Approval, Telegram identity, and current captain assignment are checked server-side.
- Inbound webhook remains /telegram/webhook; /internal/order-event is loopback-only and protected with TELEGRAM_PAIRING_BRIDGE_SECRET.
- Only IDs/status are sent from the backend to the internal event endpoint; the bot revalidates and then sends a short safe message. No user names, phone numbers, addresses, map data, OTPs, codes, wallet or payment details are sent to Telegram.
- Backend-to-bot notifications are opt-in via TELEGRAM_CAPTAIN_NOTIFICATIONS_ENABLED=true in the production backend env. Leave disabled until new backend and bot versions are deployed and verified.
- Event delivery is best-effort with bounded in-memory deduplication, not a durable message queue. FCM/app remain authoritative.
- Telegram cannot accept, reject, or mutate orders in this phase.
