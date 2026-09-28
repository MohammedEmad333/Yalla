# Cloudflare hardening for Yalla

This runbook moves the public Yalla API behind **Cloudflare Tunnel** first, then adds edge rate limiting and finally closes direct origin access. The order matters: do not close origin ports before the tunnel hostname is proven healthy.

## 1. Current production shape

- Public API: `https://api.yalladelivery.org`
- API process/container listens on port `4000`.
- Production deploy helper: `tool/deploy-server.sh`.
- Caddy currently sits in front of the API.
- The API already has application-level rate limiting:
  - general API: 300 requests/minute/IP
  - auth endpoints: 20 requests/minute/IP
- Express must only trust a local reverse proxy. This repository configures `trust proxy` for loopback rather than blindly trusting an arbitrary one-hop proxy.

## 2. Create a remotely-managed Tunnel

Cloudflare dashboard:

1. Open **Networking -> Tunnels**.
2. Create a tunnel named `yalla-api`.
3. Choose the Linux connector.
4. Copy the tunnel token only. Do not commit it, paste it into chat, or add it to `.env`.

On the Oracle server:

```bash
cd ~/Yalla
git pull origin main
bash tool/setup-cloudflare-tunnel.sh
```

Paste the token when the script asks for it. The script installs `cloudflared` from Cloudflare's official APT repository and registers it as a systemd service.

## 3. Test with a temporary hostname first

In the tunnel **Routes** tab add a **Published application**:

- Hostname: `api-tunnel.yalladelivery.org`
- Service URL: `http://localhost:4000`

Then test:

```bash
curl -fsS https://api-tunnel.yalladelivery.org/api/health
```

Expected: JSON containing `"status":"ok"` and the current `gitSha`.

Also verify a normal public endpoint and WebSocket/app behavior before cutover.

## 4. Cut over the real API hostname

Only after the temporary hostname works:

1. Add/replace the tunnel route for `api.yalladelivery.org`.
2. Service URL remains `http://localhost:4000`.
3. Remove the old DNS record that points `api.yalladelivery.org` directly at the Oracle public IP if Cloudflare does not replace it automatically.
4. Test:

```bash
curl -fsS https://api.yalladelivery.org/api/health
curl -fsS https://api.yalladelivery.org/api/restaurants
```

Keep Caddy running during this cutover. Remove or stop it only after confirming no other hostname/service on that server depends on it.

## 5. Edge rate limiting

Yalla already rate-limits inside Express, so Cloudflare should be the outer burst-control layer rather than the only protection.

For Cloudflare Free, use the single rate limiting rule for auth-sensitive paths. In **Security -> Security rules -> Rate limiting rules** create:

**Name:** `Yalla auth burst protection`

**Expression:**

```text
(http.request.uri.path eq "/api/auth/login") or
(http.request.uri.path eq "/api/auth/register") or
(http.request.uri.path eq "/api/auth/merchant/login") or
(http.request.uri.path eq "/api/auth/captain/login") or
(starts_with(http.request.uri.path, "/api/auth/password/"))
```

Suggested initial threshold:

- 10 requests per 10 seconds per source IP
- action: **Block**
- mitigation: 10 seconds

Do not use a browser challenge on these API routes; Flutter/mobile clients are not interactive browsers.

Observe Security Events for false positives before making the threshold stricter.

## 6. WAF custom rules

Cloudflare Free currently supports several custom WAF rules. Start conservatively:

- block obvious scanner paths that Yalla never serves (for example WordPress/PHP admin probes);
- keep Cloudflare's Free Managed Ruleset enabled;
- do not block countries globally because Yalla users may connect through mobile carriers, VPNs, or roaming networks.

Avoid putting Cloudflare Access directly in front of `api.yalladelivery.org`; the mobile apps need to call this hostname normally.

Cloudflare Access can be added later to the **admin web frontend** (`admin.yalladelivery.org`) as a second login gate while the API continues to use Yalla JWT authorization.

## 7. Close direct origin access

After `api.yalladelivery.org` has been stable through the tunnel:

1. Confirm SSH access is working.
2. Check which services are listening:
   ```bash
   sudo ss -ltnp
   ```
3. Verify whether Caddy/ports 80 and 443 are used by anything besides the old API ingress.
4. In Oracle Security Lists / NSGs and the host firewall, remove public ingress to application ports that are no longer required.
5. Keep SSH reachable from the addresses/rules you intentionally use.
6. Port `4000` should not be publicly reachable.

Do not blindly run a firewall script from documentation; locking out SSH is harder to recover from than leaving a port open for a few extra minutes.

## 8. Verification checklist

```bash
systemctl is-active cloudflared
curl -fsS http://127.0.0.1:4000/api/health
curl -fsS https://api.yalladelivery.org/api/health
```

Then verify from the Yalla mobile app:

- login
- restaurant/store list
- create/quote order
- realtime order updates / Socket.IO
- Jawwal payment start/status flow

## 9. Next Cloudflare phases

After Tunnel + WAF are stable:

1. Attach a custom domain such as `media.yalladelivery.org` to the R2 bucket.
2. Enable Cloudflare Images transformations and introduce fixed presets for store cards, banners and thumbnails.
3. Add Cloudflare Access to `admin.yalladelivery.org`.
4. Add Turnstile to public registration/recovery forms where appropriate.
5. Enable Web Analytics on the marketing and web-app hostnames.
