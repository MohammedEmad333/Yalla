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

- Inline list refresh, order status and menu navigation edit the existing Telegram message when a valid message ID is available, reducing chat clutter. Slash commands still create new messages.
- Refresh after unlinking or losing order access removes old actionable buttons. A no-change edit is safely acknowledged; unexpected Telegram API failures still propagate for retry.

## Read-only command shortcuts

- `/menu` opens the private-chat help menu with inline navigation buttons.
- `/status FULL_ORDER_ID` is a safe alias for `/order FULL_ORDER_ID`. A complete 24-character hexadecimal order ID is required; the backend independently rechecks the linked approved captain and order ownership on every lookup.
- These shortcuts never update an order, expose customer data, or bypass the private-chat identity check. Inline navigation continues to refresh backend authorization on every request.

## Private account linkage status

- `/account` and the **Account status** main-menu button verify the active private Telegram identity through the existing authenticated backend orders endpoint.
- Only a linked/approved boolean is displayed. No linked captain ID, phone, active order, addresses, wallet details, or merchant data appear in account status responses.
- Unlinked or unapproved accounts get safe instructions to manage their link from the Yalla app, without order buttons. A linked captain can navigate to their existing read-only order list.
- Every status check contacts the backend again; callback refresh edits the existing private message when possible, with the same sender/chat identity checks used for order access.

## Latest active order shortcut

- `/latest` and the **Latest order** menu button show the newest active order returned by the authenticated captain orders endpoint, with safe status and optional sanitized store name only.
- Every request rechecks the private chat identity and the captain-to-order ownership on the backend. It does not search by a partial order ID or reveal other captains' orders.
- The card offers a read-only status refresh and a way back to the complete active order list. If the captain is unlinked, no order details or actionable inline order buttons are shown.
- This is read-only and disabled from accessing customer addresses, codes, phones, wallets, payments or order mutation APIs.

## Webhook concurrency protection

- Concurrent processing is capped at 64 distinct Telegram update IDs per bot process to bound memory and outbound requests during bursts.
- Concurrent retries of an already running update still share the same work; completed IDs are deduplicated as before.
- If all 64 slots are busy, the bot responds HTTP 503 for *new* update IDs, so Telegram may retry later. Once a handler completes or fails, its slot is released. No update is acknowledged as processed unless its handler succeeds.
- This is process-local backpressure, not a durable queue. It does not change private-chat authorization, production secrets or the read-only capabilities.

## Readable active order summaries

- The private `/orders` and `/myorders` lists show a clear count of displayed orders (up to five) and a numbered summary per order.
- Existing sanitized references, statuses, optional store names and ownership-checked buttons remain unchanged. No customer details or order mutations are added.

## Telegram 1.1 captain experience

- `/language` and `/settings` show an Arabic/English switcher. Language is stored by private Telegram chat ID; default is Arabic. The bot never stores customer/order data in its language preference file.
- Configure `TELEGRAM_PREFERENCES_PATH` as an **absolute path on persistent writable storage** (for example `/var/lib/yalla-telegram/languages.json`), accessible only by the bot systemd user. The default for development is `<working-directory>/data/telegram-languages.json`, ignored by git. Keep this file across service deployments and back it up securely if preferences must survive. One local process owns this file: running multiple webhook replicas against the same file is unsupported.
- Settings save before Telegram acknowledges the callback. If persistence fails, the webhook returns 503 so Telegram can retry rather than reporting an unsaved preference. A corrupted preferences file fails fast instead of silently resetting users.
- Order list filtering is available via the **All**, **Assigned**, **Accepted**, and **On the way** buttons, or `/orders assigned`, `/orders accepted`, and `/orders picked_up`. The authenticated backend filters by status **before** returning up to five owned orders.
- Translation applies to menus, buttons, account views, order summaries, pairing instructions, empty states, and invalid-order guidance. The server still checks private sender ID, approved captain link, and order ownership. Order acceptance/cancellation is never available in Telegram.
- This change requires deploying the updated backend and bot together. Run backend unit/integration tests with MongoDB and bot tests first; verify both language choices, filter buttons, the account-unlinked state, and changing ownership in a controlled pilot.
