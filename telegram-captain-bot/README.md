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
