# Yalla (يلا) — Handoff for the Next Session

Real-time delivery MVP (bicycles/motorcycles) with three parts:
**User app** (Flutter), **Captain app** (Flutter, same codebase), **Admin panel** (React/Vite).
Backend: **Node.js + Express + Socket.io + MongoDB**.

Repo: `MohammedEmad333/Yalla`. **Work happens directly on `main`** (the user made `main` the trunk and develops on it; commit + push to `main`). Commits are authored as `MohammedEmad333`. An old branch `claude/yalla-delivery-app-mvp-n7s98t` still exists on the remote but is stale — ignore it (it couldn't be deleted from the sandbox because the proxy blocks git ref deletions).

---

## ⚠️ Environment gotchas (the user's machine) — READ FIRST

The user runs **Windows on ARM64** (Snapdragon) with Docker Desktop (WSL2). Getting this running took a long debugging session; here's what matters so you don't repeat it:

1. **Docker must build/run arm64.** `DOCKER_DEFAULT_PLATFORM=linux/arm64` is set permanently (`setx`). Symptom if wrong: `exec format error`, or builds that "succeed" in <1s but produce nothing (silent QEMU failure).
2. **MongoDB image** must be arm64-capable: we use `mongodb/mongodb-community-server:7.0-ubuntu2204` (the official `mongo:7` is amd64-only → "does not provide the specified platform"). This image has **no `mongosh`**, so the compose healthcheck was removed and the API retries the DB connection instead (`backend/src/config/db.js`).
3. **Admin panel is on host port `8090`** (not 8080 — 8080 was taken by another local app on the user's machine). See `docker-compose.yml`.
4. **Disk**: `C:` is full. The user redirected `TEMP`, `GRADLE_USER_HOME`, `PUB_CACHE` to `E:` (54 GB free) via `setx`. **Caveat:** if `PUB_CACHE` is on a *different drive* than the project (`D:`), the Kotlin incremental compiler crashes with "different roots". Fix used: `kotlin.incremental=false` in `mobile/android/gradle.properties` (or keep pub-cache on the same drive as the project).
5. **Flutter runs on a physical phone** (`2201116SC`, a Redmi). Backend URL is passed at runtime: `flutter run --dart-define=API_HOST=<PC-LAN-IP>` (get it from `ipconfig`; phone + PC on same WiFi). Physical Android needs cleartext HTTP: add `android:usesCleartextTraffic="true"` to `<application>` in `mobile/android/app/src/main/AndroidManifest.xml`.
6. **Firebase and google_maps_flutter were removed from the mobile app** to make it build/run without external keys. The two map screens are now map-free (preset location pickers + coordinate display). Re-add later with a Google Maps API key / `flutterfire configure` (notes in `mobile/README.md`).
7. `mobile/android/` is generated locally with `flutter create --platforms=android .` and is **not** in the repo.

---

## How to run (daily)

```powershell
# 1) Start Docker Desktop, wait for green
# 2) Backend + Mongo + Admin (data persists in a volume)
cd D:\Projects\Yalla\Yalla
docker compose up -d
docker compose ps            # all three "Up"

# 3) Admin:   http://localhost:8090
#    API:     http://localhost:4000/api/health
#    Docs:    http://localhost:4000/api/docs

# Rebuild only after backend code changes:
docker compose up -d --build

# First-time only: seed an admin
docker compose exec api npm run seed:admin "المدير" 0100000000 "Pass1234"
```

Mobile:
```powershell
cd D:\Projects\Yalla\Yalla\mobile
flutter run --dart-define=API_HOST=<PC-LAN-IP>
```

### Test accounts (already seeded in the running DB)
- Admin: `0100000000` / `Pass1234`
- User: `0122222222` / `User1234`
- Captain: `0111111111` / `Cap12345`

There is a `curl`/PowerShell snippet earlier in the history to create captain+user+order+set-online for a full demo loop.

---

## What's built (all on `main`, ~99 unit tests + integration tests, CI green)

**Backend** (`backend/`, clean layered architecture: config/models/services/controllers/routes/middlewares/sockets/utils)
- **Auth (unified):** one `/auth/login` for user/admin/captain (checks User then Captain), JWT + roles, `/auth/me`, admin-only captain creation, `seed:admin` script.
- **Orders:** create with **server-side pricing** (Haversine + tariff, `pricing.service`), **ETA** (`utils/eta`), optional **scheduling** (`utils/schedule` + background worker `scheduler.service`), **idempotency** (`Idempotency-Key` header, partial-unique index).
- **Assignment:** manual, **auto-assign nearest** (2dsphere `$near`), **reject → reassign** excluding rejecters, **accept-timeout → reassign** (worker). Shared `returnToPoolAndReassign`.
- **Status machine** with validated transitions; **cancellation** (user/admin/captain, pre-pickup).
- **Ratings & reviews** (moving average, distribution), **captain earnings** + **COD wallet** (commission/net/owed + admin settlement).
- **User wallet & digital top-up** (`docs/05-wallet-topup.md`): `Wallet` + `WalletTransaction` models, **Strategy Pattern** payment layer (`services/payment/`: `ManualReceiptUploadStrategy` now + `JawwalPay`/`BankOfPalestine` gateway stubs for Phase 2), atomic idempotent approve/reject that credits balance, receipt image upload (multer → `/uploads`), user routes `/wallet*`, admin routes `/admin/wallet/topups*`. Adding a real gateway later = register a strategy, no wallet-logic changes.
- **Notifications:** FCM push (config-driven, safe no-op without creds) + **in-app** notifications feed.
- **Admin APIs:** live dashboard data, users/captains management, **order search/filter+pagination**, **CSV export**, **stats/KPIs**.
- **Realtime:** Socket.io rooms (admins / captain:<id> / user:<id> / order:<id>).
- **Docs:** OpenAPI spec at `/api/openapi.json` + simple viewer at `/api/docs` (`src/docs/`).
- **Tests:** `npm test` (unit, no DB) + `npm run test:integration` (mongodb-memory-server or `TEST_MONGO_URI`; self-skips without DB). CI runs both against a real Mongo.

**Admin** (`admin/`, React + Vite): login gate, live dashboard (manual + ⚡auto assign), users/captains management (+ approve, wallet/settle, reviews), order search + CSV export, stats page. Nav in `App.jsx`.

**Mobile** (`mobile/`, Flutter): unified single login (login/register toggle), user home (create order / my orders / **wallet** / notifications / profile), captain home (active order / earnings / notifications / profile), reactive auth via `ValueNotifier<AuthSession?>` in `AuthRepository`, in-memory-cached `TokenStorage`, `SocketService`, `ApiClient` (host via `AppConfig`/`--dart-define`). Wallet screens under `features/wallet/` (top-up via `image_picker` + multipart upload; live balance via `wallet:updated` socket event).

**Deploy/CI:** `docker-compose.yml` (mongo + api + admin), `.github/workflows/ci.yml` (unit + integration + admin build), `docs/01..03` (data architecture, realtime flow, deployment).

---

## Recently fixed (last session)
Unified login for all roles; fixed "login shows error but signs in after restart" (session now drives navigation directly), "no token" on requests (in-memory token cache), and broken sign-out. Backend `/auth/login` response shape unchanged, so the admin panel is unaffected. **Requires `docker compose up -d --build`.**

## Known gaps / good next steps
- **Re-enable Maps** (add `google_maps_flutter` + API key; restore map screens) and **FCM** (Firebase config) when keys are available.
- Delete the stale remote branch `claude/yalla-delivery-app-mvp-n7s98t` (needs to be done from a normal machine; sandbox proxy blocks ref deletion).
- Not built yet: i18n (ar/en), a ready-made Postman collection, deeper analytics.
- Mobile: wire "My Orders" → order tracking / detail screens; add order detail navigation.
- nginx on the admin image logs harmless `io_setup() failed` on WSL2 — non-fatal; `wsl --update` silences it.

## Conventions
- Arabic UI and Arabic code comments; keep them.
- Every new pure helper gets `node:test` unit tests under `backend/tests/`.
- Verify before commit: `cd backend && npm test`; for admin JSX changes, `cd admin && npm run build`.
- Respond to the user in Arabic.
