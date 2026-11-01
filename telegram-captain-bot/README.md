# Yalla Telegram Captain Bot (safe foundation)

A standalone **private-chat-only** Telegram webhook service. No customer data or captain actions are enabled until server-side pairing, authorization and order-state tests are implemented.

## Local setup
Node.js 22+ required. No npm dependencies.

```sh
export TELEGRAM_BOT_TOKEN='from BotFather'
export TELEGRAM_WEBHOOK_SECRET='random-secret-allowed-by-Telegram'
node --test test/*.test.js
node index.js
```

The service listens on 127.0.0.1:8098 by default. Configure your TLS reverse proxy to route only `POST /telegram/webhook` to this service. Register the public HTTPS webhook with Telegram's `setWebhook` using the same secret_token. Do not expose the local port publicly.

## Safety
- No order actions or account linking are implemented yet.
- Never collect credentials or OTPs in Telegram.
- Group chats are ignored; callback queries are acknowledged.
- Bot token and webhook secret must remain outside git.
- Telegram delivery may be retried; future state-changing actions must be idempotent and authorized server-side.
- Do not deploy as a working captain interface until the pairing and API authorization phases pass.
