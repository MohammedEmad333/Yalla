# Telegram captain pairing — production rollout

## Verified baseline (2026-11-01)
- Telegram webhook: https://bot.yalladelivery.org/telegram/webhook (POST only through Caddy).
- Bot: systemd `yalla-telegram-captain.service`, local health `http://127.0.0.1:8098/health`.
- API: Docker `yalla-api`, local health `http://127.0.0.1:4000/api/health`.
- Backend deployment: `cd ~/Yalla && bash deploy.sh`; **not** `docker compose up` in production.
- Production backend env: `~/yalla.env`; bot env: `/etc/yalla-telegram/bot.env`. Never commit either file.
- Production Mongo credentials must use a working application account. On 2026-11-01 `yalla_admin` with `authSource=admin` failed SCRAM; `yalla_app` with `authSource=yalla` was tested successfully. Never overwrite production `MONGO_URI` from generic Compose defaults.

## Pairing API contract
- `POST /api/telegram-captain/pairing-code`: captain JWT required, captain role and approved account; returns single-use code (32 chars, 5-minute expiry). Treat as sensitive, do not log.
- `DELETE /api/telegram-captain/link`: captain JWT required; revokes existing Telegram link.
- `POST /api/telegram-captain/internal/redeem`: bot-to-backend only; header `x-telegram-pairing-secret` with `TELEGRAM_PAIRING_BRIDGE_SECRET`. Do not call from client apps.
- Captain sends `/start CODE` privately to @YallaDeliveryCaptainBot; bot redeems code server-to-server.
- Bot without code only shows onboarding; it does not issue a code.

## Required captain UI
1. Authenticated captain settings: “ربط حساب تيليجرام” action.
2. Request pairing code via captain-authenticated API; show expiry and copy/open Telegram link. Never include code in analytics, logs, crash reports, or notification payloads.
3. Show clear success/failure/expiry states; request a fresh code on expiry. Do not infer success merely from opening Telegram.
4. “إلغاء الربط” invokes DELETE /link with confirmation.
5. Test on actual approved captain account. The API currently exposes no GET link-status endpoint; implement authenticated status before presenting an authoritative linked/unlinked badge.
6. Avoid exposing internal bridge secret or webhook token in frontend bundles.

## Safe production verification
```bash
curl -fsS http://127.0.0.1:4000/api/health
curl -fsS http://127.0.0.1:8098/health
sudo systemctl is-active yalla-telegram-captain
docker exec yalla-api sh -c 'test -n "${TELEGRAM_PAIRING_BRIDGE_SECRET:-}" && echo bridge-configured'
```

Check bot/backend secrets match **without printing either**. Do not use production user tokens in shared transcripts. Validate full pairing with a dedicated approved test captain, then unlink and verify re-pairing.

## Recovery
If deployment fails with `AuthenticationFailed: storedKey mismatch`, first verify `MONGO_URI` against the known working app account; avoid resetting MongoDB users, deleting volumes, or assuming the previous Docker image fixes credential mismatch. Keep a restrictive-permission backup of `~/yalla.env` before changes. Re-run `bash deploy.sh` only after verifying DB authentication. Ensure API health returns 200 before continuing rollout.

## Remaining acceptance criteria
- [ ] Captain UI issues code and provides Telegram handoff
- [ ] Authenticated GET link status (if UI shows link state)
- [ ] Integration tests: valid, expired, replayed, wrong-captain, and revoked pairing
- [ ] End-to-end verification using approved test captain
- [ ] Documentation and release checks updated after verification
