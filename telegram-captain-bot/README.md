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
- Read-only `/orders`, `/myorders` and status refresh are available for linked approved captains in private chats. No Telegram order mutations, customer identity, addresses, OTPs, or payment data are exposed.
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


## Pilot status alerts (backend only)

- The existing opt-in backend sender now supports accepted, picked_up, delivered, and cancelled events.
- Disabled unless `TELEGRAM_CAPTAIN_NOTIFICATIONS_ENABLED=true` and the captain is explicitly included in `TELEGRAM_CAPTAIN_NOTIFICATIONS_CAPTAIN_IDS`; a wildcard is not suitable for the pilot.
- Before sending an event, the backend checks that the captain is approved, linked to a matching private Telegram chat, and still owns the order in the expected current status.
- Only a short order reference and safe status label are sent. The order remains read-only in Telegram. No separate event bridge or new bot secrets are introduced.
- Changes to backend code do not automatically deploy the separate bot systemd service. Start with a single approved pilot captain and verify actual order transitions.


## Captain self-service menu

- In a private chat, use `/start`, `/help`, or `/commands` to see the safe read-only menu.
- `/privacy` explains what the bot intentionally excludes from replies and how to unlink in the Yalla app.
- Inline buttons provide **My active orders**, **Privacy**, and **Help**.
- The active orders button uses the same authenticated backend endpoint and private-chat identity match as `/orders`.
- A callback from an identity different from the private chat owner is ignored. No Telegram-based accept, delivery, cancel, payments, or customer data access is introduced.

## Single-order read-only lookup

- Use `/order FULL_ORDER_ID` in the captain's private Telegram chat to view an owned order's current safe status.
- The ID must be the complete 24-character hexadecimal order ID. Short references are not globally searchable.
- Every lookup reuses the existing authenticated backend `/internal/order` route, which rechecks approved Telegram linkage and order ownership; missing, inaccessible or reassigned orders are not revealed.
- Responses include only a short reference, current status and sanitized optional store name, plus a safe refresh button. No writes or customer details are available.

## Permanent Telegram delivery failures

- If a captain blocks the bot or deactivates their Telegram account, the API returns a known permanent error. The webhook safely acknowledges the corresponding update instead of retrying the impossible message indefinitely.
- Expired Telegram callback acknowledgements are also treated as permanent. Unauthorized responses, rate limits, server outages, malformed API replies and other unexpected errors still fail the webhook so Telegram may retry.
- Bot tokens and raw Telegram error descriptions are never included in thrown error messages. This does not change pairing authorization, per-captain allowlists or order mutations.

## Refreshable private order navigation

- `/orders` and `/myorders` show up to five current assigned/accepted/picked-up orders with one button per order, a `Refresh list` button and a safe return to the help menu.
- The details view offers both status refresh and `My active orders` navigation. A refresh always queries the authenticated backend again; no stale cached ownership or customer details are used.
- All callbacks require a private chat whose chat ID matches the Telegram sender. Unlinked captains receive no order details or order buttons.
- These are read-only Telegram controls. Accepting, rejecting, cancelling or delivering an order remains available only in the Yalla app.
