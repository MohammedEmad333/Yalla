# Telegram 1.3: production rollout and verification

## Confirmed from GitHub Actions

- The admin UI was built and deployed by `Build & Deploy Yalla Admin Web` for commit `3000101a5171520fcd58acd14b0f3347b3da360c`.
- CI, CodeQL, and Docker builds passing on GitHub do **not** prove the Oracle backend was deployed.
- Oracle production uses `tool/deploy-server.sh` on the server. There is no GitHub Actions workflow that automatically deploys the API.
- A successful public `/api/health` request proves availability, not the deployed revision.

## Operator steps (run on the Oracle host)

Use the existing deploy-key and server access; do not copy any tokens into GitHub issues or chat.

1. Confirm an up-to-date backup and note the currently deployed SHA:
   ```bash
   cd ~/Yalla
   docker exec yalla-api printenv APP_GIT_SHA
   git fetch origin main
   git status --short
   ```
2. Deploy with the established script, which tags the previous Docker image for rollback and checks the running API:
   ```bash
   cd ~/Yalla
   bash tool/deploy-server.sh
   ```
3. Verify the actual deployed revision against the current checkout and check that the new read-only metrics endpoint rejects anonymous requests, MongoDB indexes exist and the pilot is not accidentally opened:
   ```bash
   bash tool/check-telegram-production.sh
   ```
   The smoke check never reads or prints Telegram tokens, secrets, database connection strings, or captain identities. It does not perform sends or modify MongoDB. If the metrics indexes are absent, investigate the app's normal Mongoose index initialization and initialize the indexes through the usual controlled database process before rerunning.
4. Sign in at `https://admin.yalladelivery.org` as an authorized operations/super admin. Open **مراقبة Telegram** and check the 1/7/30 day summaries. Confirm other admin roles cannot open `/api/admin/telegram/metrics` and the route returns `Cache-Control: private, no-store`.
5. With an **approved test captain** only, keep the configured notification pilot allowlist restricted to that captain's ID and enable notifications deliberately. In a private Telegram chat, verify `/notifications`, assignment/status preferences, status updates and the order ownership/reassignment rules. Check the metrics only for aggregate counts, not personal details. Do not send notification or account secrets into logs.
6. Observe rate limiting and error counters after the pilot; do not deliberately trigger high-rate production traffic to test HTTP 429.

## If checks fail

- If the API service is unhealthy, inspect the deployment's rollback output and `docker logs --tail 100 yalla-api` locally on Oracle without sharing secrets.
- If the image SHA differs from the checkout, re-evaluate the deployment before touching settings.
- If the protected metrics route returns HTTP 200 without credentials, disable public access immediately and investigate backend authorization.
- If MongoDB indexes are missing, stop the pilot and check index initialization. The metrics endpoint is informational; do not treat unreported failures as zero incidents.
- The admin Cloudflare deployment and backend Oracle deployment are separate. Do not redeploy the admin simply to compensate for an outdated API.
- A live notification test must be conducted by the authorized operator with a test account. A GitHub CI success cannot substitute for it.
