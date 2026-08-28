# Yalla (يلا) — Handoff for the Next Session

Real-time delivery MVP (bicycles/motorcycles) with three parts:
**User app** (Flutter), **Captain app** (Flutter, same codebase), **Admin panel** (React/Vite).
Backend: **Node.js + Express + Socket.io + MongoDB**.

Repo: `MohammedEmad333/Yalla`. **Work happens directly on `main`** (the user made `main` the trunk and develops on it; commit + push to `main`). Commits are authored as `MohammedEmad333`. An old branch `claude/yalla-delivery-app-mvp-n7s98t` still exists on the remote but is stale — ignore it (it couldn't be deleted from the sandbox because the proxy blocks git ref deletions).

---

## 🌐 Production (current) — Oracle Cloud

الإنتاج كلّه على **سيرفر Oracle Cloud (Always Free, Ubuntu 22.04 ARM)** واحد — **لم يعد على Render/Atlas** (حُذف `render.yaml`). التفاصيل الكاملة في [`docs/12-oracle-cloud-migration.md`](docs/12-oracle-cloud-migration.md).

- **تشغيل يدوي بـ `docker run`** (ليس docker-compose): ثلاث حاويات — `yalla-mongo` (بيانات في volume `yalla_mongo_data`، مقفولة على `127.0.0.1`)، `yalla-api` (Node، `--network host` على :4000، env عبر `~/yalla.env`، يربط `~/fcm.json:/app/fcm.json:ro` و `yalla_uploads:/app/uploads`)، و `caddy` (HTTPS تلقائي، `~/caddy/Caddyfile` يوجّه `yalla-api.duckdns.org` → :4000).
- **الواجهات على CDN:** لوحة الأدمن على **Vercel**، تطبيق الويب على **Cloudflare** — كلاهما يشير إلى `https://yalla-api.duckdns.org`.
- **FCM مفعّل** عبر `~/fcm.json` (`FCM_CREDENTIALS_PATH`).
- **تحديث الباك اند:** أعِد بناء `yalla-api` وأعِد إنشاء الحاوية — الأمر الكامل في `docs/12`. لا تشغّل `docker compose up` على السيرفر (يسبّب تعارضًا مع الحاويات اليدوية).
- **الصور الشخصية** تُخزَّن في قاعدة البيانات (`FileAsset` + `/files/<id>`) لا على القرص — Card 102.

> ملاحظة: قسم «Environment gotchas» أدناه يخصّ **جهاز التطوير المحلّي (Windows)** للمطوّر، لا الإنتاج.

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

**Deploy/CI:** production = Oracle Cloud (manual `docker run`, see «Production» above + `docs/12`). `docker-compose.yml` (mongo + api + admin + uploads volume) is for **local dev** only. `.github/workflows/ci.yml` (unit + integration + admin build) + `build-admin-apk.yml` (يبني APK للوحة الأدمن). `docs/01..03` (data architecture, realtime flow, deployment).

**Admin Android app (Card 103):** لوحة الأدمن مُغلَّفة بـ **Capacitor** (`admin/android/`، الحزمة `com.yalla.admin`) لاستقبال إشعارات Push. الخادم يرسل Push للمشرفين عبر `notifyAdmins` (طلب جديد / سحب رصيد). البناء عبر workflow «Build Admin APK» (أسرار: `ADMIN_API_URL`, `GOOGLE_SERVICES_JSON_BASE64`). دليل: `admin/README-android.md`.

---

## Recently fixed (this session — Cards 104/105)
- **#104 الصورة الشخصية لا تظهر في التطبيق ولا لوحة الأدمن:** بعد نقل التخزين إلى
  قاعدة البيانات (Card 102)، كانت قراءة `FileAsset` بـ `.lean()` تُعيد حقل البيانات
  كـ **BSON Binary** لا `Buffer`، فكان `res.send` يُسلسِله كـ JSON (نصّ base64)
  بترويسة `application/json` بدل الصورة الخام — فلا تظهر في أيّ واجهة. الحلّ: أداة
  `utils/toBuffer` تُعيد `Buffer` صحيحًا، ويُرسل مسار `/files/<id>` البايتات عبر
  `res.end` مع `Content-Length`. + اختبارات وحدة.
- **#105 نسخة أندرويد للوحة الأدمن — إشعارات أكثر + واجهة + سحب للتحديث:**
  - **إشعارات أدمن جديدة (Push + داخليّة):** رسالة دعم جديدة من زبون، طلب شحن رصيد
    (إضافة رصيد)، تسجيل زبون جديد، وطلب توثيق كابتن جديد — عبر `notifyAdmins` مع
    حمولات نقيّة جديدة في `notification.service` (سحب الرصيد كان موجودًا مسبقًا).
  - **السحب للتحديث:** مكوّن `admin/src/components/PullToRefresh.jsx` مستقلّ بلا
    مكتبات، مربوط في `App.jsx` بإعادة تركيب الصفحة الحاليّة فتُعيد تحميل بياناتها.
  - **واجهة أنسب لأندرويد:** احترام آمِن الحواف (`safe-area-inset`)، منع السحب
    الافتراضيّ للمتصفّح (`overscroll-behavior`)، وإلغاء وميض اللمس.

## Previously fixed (Cards 102/103)
- **#102 اختفاء الصورة الشخصية:** كانت تُخزَّن على قرص الحاوية المؤقّت فتُمحى عند إعادة الإنشاء. الآن تُخزَّن في قاعدة البيانات (`FileAsset`) وتُخدَم من `/files/<id>`. أُضيف أيضًا volume دائم `yalla_uploads` للإيصالات/مستندات الكباتن. **مُطبَّق على السيرفر.**
- **#103 نسخة أندرويد للأدمن + إشعارات:** الخادم صار يرسل Push للمشرفين (`notifyAdmins`)، ولوحة الأدمن تُسجّل جهازها (`admin/src/push.js`)، ومشروع Capacitor في `admin/android/` + workflow لبناء APK. **جانب الخادم مُطبَّق؛ يتبقّى بناء APK بأسرار Firebase.**

## Previously fixed (earlier sessions)
Unified login for all roles; fixed "login shows error but signs in after restart" (session now drives navigation directly), "no token" on requests (in-memory token cache), and broken sign-out. Backend `/auth/login` response shape unchanged, so the admin panel is unaffected.

## Known gaps / good next steps
- **Re-enable Maps** (add `google_maps_flutter` + API key; restore map screens) when keys are available. (FCM مفعّل بالفعل على السيرفر عبر `~/fcm.json`.)
- Delete the stale remote branch `claude/yalla-delivery-app-mvp-n7s98t` (needs to be done from a normal machine; sandbox proxy blocks ref deletion).
- Not built yet: i18n (ar/en), a ready-made Postman collection, deeper analytics.
- Mobile: wire "My Orders" → order tracking / detail screens; add order detail navigation.
- nginx on the admin image logs harmless `io_setup() failed` on WSL2 — non-fatal; `wsl --update` silences it.

## Conventions
- Arabic UI and Arabic code comments; keep them.
- Every new pure helper gets `node:test` unit tests under `backend/tests/`.
- Verify before commit: `cd backend && npm test`; for admin JSX changes, `cd admin && npm run build`.
- Respond to the user in Arabic.
