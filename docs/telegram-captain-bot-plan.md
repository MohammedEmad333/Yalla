# Telegram Captain Bot — Integration Contract (Phase 1)

## Purpose
Provide an extremely lightweight Telegram interface for **existing, authenticated Yalla captains**. It is an alternate client, not a second order system. WhatsApp customer-support bot in `bot/` stays unchanged.

## Verified backend routes
All routes are mounted under `/api` and require JWT authentication. Captain-only routes require `ROLES.CAPTAIN`.

| Action | Method | Route |
| --- | --- | --- |
| Availability | PATCH | /captains/status |
| Captain orders | GET | /captains/me/orders |
| Earnings | GET | /captains/me/earnings |
| Wallet | GET | /captains/me/wallet |
| Available broadcast orders | GET | /orders/available |
| Claim broadcast order | POST | /orders/:orderId/claim |
| Reject assigned order | PATCH | /orders/:orderId/reject |
| Change order status | PATCH | /orders/:orderId/status |
| Order details | GET | /orders/:orderId |
| Order messages | GET, POST | /orders/:orderId/messages |

Source: `backend/src/routes/captain.routes.js`, `backend/src/routes/order.routes.js`. Do not assume payload shapes or transitions until controllers and tests are reviewed.

## Security contract
- Link Telegram chat/user ID only after a short-lived, single-use, server-issued pairing code authenticated in the captain app. Never accept a Telegram username or telephone number as proof of identity.
- Store a revocable server-side binding to captain ID, and authorize every action against the captain's current account status and order ownership. No admin tokens, shared captain JWTs, or login passwords in Telegram.
- Private chats only; reject group/supergroup requests and forwarded commands. Do not expose delivery OTPs, full customer addresses, or phone numbers in notification previews.
- Every callback must be short-lived and re-check current order state and captain assignment server-side. Use idempotency/atomic transition protection for retries and double taps.
- Support unlink/revoke and log sensitive state changes without storing Telegram message content.

## Weak-network contract
- Text + inline keyboard only by default; no photos, map previews, or automatic location sharing.
- Acknowledge callbacks promptly, then confirm **only after** backend mutation succeeds.
- Timeout and retry GET requests with bounded backoff; retry mutating requests only when backend provides idempotent semantics. On ambiguous outcome, re-fetch state.
- Avoid high-frequency polling of Yalla API; send event-driven order notifications and allow manual refresh.
- Never report a delivery as completed from a locally cached Telegram response.

## Delivery stages
1. Inspect controller request/response schemas, order state machine, OTP and captain authentication; add tests for these contracts.
2. Implement secure pairing and unlink API plus persistent binding and audit trail.
3. Add `telegram-captain-bot/` Node.js service, private-chat menus and read-only views.
4. Add claim/reject/status actions with server-side ownership checks, race-safe transitions and negative tests.
5. Integrate order events, earnings, wallet, CI, deployment documentation, and a low-bandwidth field test.

## Deployment
Run as a separately configured process/container on Oracle. Keep Telegram token in environment secrets; use a restricted webhook endpoint with Telegram secret verification in production. No production rollout until end-to-end tests pass.
