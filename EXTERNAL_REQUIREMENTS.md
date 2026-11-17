# External requirements — Auth on Server A, Assets and Portal on Server B

This document is the deployment contract for the target topology:

```text
Browser
  |  HTTPS
  +------------------------------+------------------------------+
  |                              |                              |
  v                              v                              v
https://auth.example.com     https://portal.example.com    https://assets.example.com
Server A                     Server B                      Server B
Basis Auth                   Nuxt portal                   DevConnect Assets
  |                              |                              ^
  |  private internal API        |  server-to-server HTTPS      |
  +<-----------------------------+                              |
  |                                                             |
  +<-------------------------- browser direct ------------------+
```

Server A hosts **only Basis Auth**. Server B hosts **the portal and the Assets
API**. The browser always talks to all three public origins. The portal server
also talks privately to Auth and Assets.

`BASIS_PORTAL_ORIGIN` must be the exact browser origin of the portal. It must
not include a path, query, or fragment, and the portal must be deployed at the
root of that host.

---

## 1. What must change in Basis Auth (Server A)

### 1.1 Public URL and issuer

| Setting | Required value |
|---|---|
| Public issuer | `https://auth.example.com` |
| `ISSUER` | Same value as the portal’s `BASIS_AUTH_ISSUER` |
| OIDC discovery | `https://auth.example.com/.well-known/openid-configuration` |
| JWKS | `https://auth.example.com/oauth/jwks` |
| Token endpoint | `https://auth.example.com/oauth/token` |
| Avatars | `https://auth.example.com/api/picture/{userId}` |

The `iss` claim in access tokens must be the public issuer, not an internal
hostname. If Auth uses a private CA, the portal host must trust it
(`NODE_EXTRA_CA_CERTS`).

### 1.2 Register the portal OIDC client

Create one confidential client:

| Field | Value |
|---|---|
| Client type | Confidential |
| Redirect URI | `https://portal.example.com/api/auth/callback/basis-auth` |
| Scopes | `openid profile email offline_access noesis.access` |
| Resource/audience | `devconnect://noesis` |
| Permissions | Every `BiszPortal.*` string from `shared/permissions.ts`, including the new `Resources.*` permissions |
| Grant access | All users who should use the portal |

The portal sends the authorization code with PKCE and `client_secret_basic`.

### 1.3 Register the Assets OIDC client

Create a second confidential client:

| Field | Value |
|---|---|
| Client type | Confidential |
| Redirect URI | `https://portal.example.com/api/auth/callback/assets` |
| Scopes | `openid profile email offline_access assets.access` |
| Resource/audience | The value of `BASIS_ASSETS_AUDIENCE` on Server B |
| Permissions | `Assets.Projects.create`, `Assets.Assets.create` as needed |
| Grant access | Users who may use the Assets screens |

### 1.4 Internal API reachability

The portal on Server B calls Auth’s internal API:

```text
BASIS_AUTH_INTERNAL_URL=https://auth-internal.example.com
# or a private address such as http://10.0.0.10:3001
```

Required:

- The internal listener must be reachable from **Server B**, not only from
  `localhost` on Server A.
- If it is bound to `127.0.0.1` on A, put a private reverse proxy, VPN, or SSH
  tunnel in front of it. Do not expose it to the public internet without mTLS
  or an allowlisted network.
- Allow the `x-basis-resource` header and `Authorization: Bearer
  <BASIS_AUTH_RESOURCE_SECRET>`.
- Set `BASIS_AUTH_RESOURCE_SECRET` to the same value on Auth and the portal.
- The portal sends `x-basis-resource: <URL-encoded BASIS_AUTH_RESOURCE>`; Auth
  must validate it.
- The internal API must be able to resolve the resource and the actor token.

If the internal API uses a private certificate, set `NODE_EXTRA_CA_CERTS` on
Server B to the CA bundle.

### 1.5 Backchannel logout from Auth to Portal

Auth must be able to call:

```text
https://portal.example.com/api/auth/backchannel-logout
```

Required:

- Register that URL for `BASIS_AUTH_RESOURCE` in the resource’s
  **Backchannel** settings, or pre-set `backchannelLogoutUri` in
  `OIDC_RESOURCES_JSON`.
- Allow outbound HTTPS from Server A to Server B on 443.
- If Server B is behind a WAF or private network, allowlist Server A.
- The endpoint validates the challenge with the same
  `BASIS_AUTH_RESOURCE_SECRET`.

Without this, sign-out on Auth will not revoke the portal session and
access-token revocations will not reach the portal.

### 1.6 Portal actor validation

Auth must continue to accept the portal’s actor tokens:

```text
gty != client_credentials
client_id == MANAGEMENT_PORTAL_CLIENT_ID
scope contains MANAGEMENT_PORTAL_SCOPE (noesis.access)
signature, issuer, audience valid
```

Portal-side values must match:

```text
MANAGEMENT_PORTAL_CLIENT_ID=BASIS_AUTH_CLIENT_ID
MANAGEMENT_PORTAL_AUDIENCE=BASIS_AUTH_RESOURCE
MANAGEMENT_PORTAL_SCOPE=noesis.access
```

### 1.7 Permission catalog

Every string in `shared/permissions.ts` must exist in the portal application
catalog, including:

```text
BiszPortal.Projects.*
BiszPortal.ProjectMembers.manage
BiszPortal.Tasks.*
BiszPortal.Tags.*
BiszPortal.Incidents.*
BiszPortal.Calendar.read
BiszPortal.Users.read|update
BiszPortal.ExportCSV.create
BiszPortal.Applications.*
BiszPortal.Resources.*
BiszPortal.ApplicationOwners.manage
BiszPortal.ApplicationResources.manage
BiszPortal.ApplicationScopes.manage
BiszPortal.ApplicationPermissions.manage
BiszPortal.ApplicationRedirectUris.manage
BiszPortal.ApplicationCredentials.manage
```

The portal does not invent new permission strings. A catalog change requires an
Auth release and re-granting users.

---

## 2. What must change on Server B (Portal)

### 2.1 Portal environment

```dotenv
# Public origin the browser uses. No trailing slash, no path.
BASIS_PORTAL_ORIGIN=https://portal.example.com

# Auth on Server A
BASIS_AUTH_ISSUER=https://auth.example.com
BASIS_AUTH_CLIENT_ID=<portal client id>
BASIS_AUTH_CLIENT_SECRET=<portal client secret>
BASIS_AUTH_RESOURCE=devconnect://noesis
BASIS_AUTH_INTERNAL_URL=https://auth-internal.example.com
BASIS_AUTH_RESOURCE_SECRET=<shared resource secret>

# Session + token encryption
NUXT_APP_SECRET=<at least 32 random characters>

# Portal database on Server B or a database host reachable from B
DATABASE_URL=postgresql://...
DATABASE_POOL_MAX=10

# Assets on Server B
BASIS_ASSETS_CLIENT_ID=<assets client id>
BASIS_ASSETS_CLIENT_SECRET=<assets client secret>
BASIS_ASSETS_AUDIENCE=<registered assets audience>
BASIS_ASSETS_TOKEN_KEY=<base64 32-byte key>
BISZ_ASSETS_API_URL=https://assets-internal.example.com
NUXT_PUBLIC_BISZ_ASSETS_API_URL=https://assets.example.com

# Web Push (optional)
NUXT_VAPID_PUBLIC_KEY=
NUXT_VAPID_PRIVATE_KEY=
NUXT_VAPID_SUBJECT=mailto:operations@example.com
NUXT_PUSH_TOKEN_KEY=
NUXT_PUBLIC_PUSH_ENABLED=false

# Private CA used by Auth/Assets, if any
NODE_EXTRA_CA_CERTS=/etc/ssl/private-ca.pem
```

Notes:

- `BISZ_ASSETS_API_URL` is server-to-server. It may be a private hostname.
- `NUXT_PUBLIC_BISZ_ASSETS_API_URL` is browser-facing. It must be reachable by
  users and must allow the portal origin via CORS.
- If Assets is exposed on the same host as the portal under a path, use that
  origin as the public URL and configure Assets’ base path. A different port or
  hostname means CORS is required.
- `BASIS_PORTAL_ORIGIN` controls CSRF checks, HSTS, secure cookies, and the
  backchannel URL. It must match the browser address exactly.
- Use the same `NUXT_APP_SECRET` on every portal instance.
- Do not put server secrets in `NUXT_PUBLIC_*`.

### 2.2 Portal database

- PostgreSQL 15+.
- Portal-owned database only. Never point `DATABASE_URL` at Auth’s database.
- Run `bun run db:migrate` before starting the new build. The latest migration
  is `0016_collaboration`.
- Keep the database private to Server B and its backup path.
- Required extensions: `pgcrypto` if `gen_random_uuid()` is unavailable;
  `pg_trgm` is optional.
- SSL required outside localhost.

### 2.3 Portal reverse proxy

The portal listens on an internal port behind HTTPS:

```text
Client -> TLS terminator -> http://127.0.0.1:4005
```

Required headers:

```text
Host: portal.example.com
X-Forwarded-Proto: https
X-Forwarded-For: <client ip>
```

Rules:

- Preserve `Host`; the OAuth token exchange sends an explicit `redirect_uri`,
  but other callback behavior still expects the public host.
- Do not cache SSR HTML. CSP nonces are generated per request.
- Cache only `/_nuxt/**`, `/icons/**`, and the font files.
- Serve `/sw.js` with `Cache-Control: no-cache`.
- Do not expose the Nitro process directly; otherwise clients can spoof
  `X-Forwarded-For` and bypass the rate-limit key.
- Do not strip the `Cookie` header.
- Allow the body limits needed by normal JSON requests. Asset uploads go
  directly from the browser to Assets, not through the portal.

### 2.4 Assets on Server B

Assets must be reachable from two places:

1. **Browser** at `NUXT_PUBLIC_BISZ_ASSETS_API_URL`.
2. **Portal server** at `BISZ_ASSETS_API_URL` for project creation/repair.

Required CORS for the browser origin:

```text
Access-Control-Allow-Origin: https://portal.example.com
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type, X-Upload-Session-Token
Access-Control-Expose-Headers: Content-Type, Content-Disposition, Content-Length, ETag, Cache-Control, Accept-Ranges, Content-Range
```

Additional requirements:

- `OPTIONS` preflight must succeed without credentials; the portal sends
  `credentials: "omit"`.
- Support `Range` for video/audio/PDF previews and large downloads.
- Return correct `Content-Type` and `Content-Disposition`.
- Allow the Assets OIDC redirect URI on Auth:
  `https://portal.example.com/api/auth/callback/assets`.
- Tokens are validated by the portal before storage and never sent to the
  browser except as a short-lived access JWT in tab-scoped `sessionStorage`.

### 2.5 Cookie behavior across two servers

- The portal session cookie is host-only for `portal.example.com`. It does not
  need to be shared with Auth.
- Cookies are `HttpOnly`, `Secure`, and `SameSite=Lax`. The OAuth flow is a
  top-level redirect, so `Lax` is sufficient.
- Do not set a cookie `Domain` across unrelated hosts. If Auth and Portal share
  a parent domain, keep the portal cookie host-only unless you have a specific
  reason to share it.
- Auth must use HTTPS; otherwise the portal refuses to issue a secure session
  cookie in production.

### 2.6 CSP and browser connections

The portal’s CSP is generated from `BASIS_PORTAL_ORIGIN` and
`NUXT_PUBLIC_BISZ_ASSETS_API_URL`:

- `connect-src` includes the portal and Assets public origin.
- `media-src` includes Assets so video/audio previews work cross-origin.
- `frame-src` includes Assets for PDF previews.
- `img-src` allows HTTPS images so Markdown and Auth avatars render.
- `script-src` uses per-request nonces. Any CDN must not cache HTML.

If you add another browser-facing origin, update the CSP and CORS together.

### 2.7 Network matrix

| Source | Destination | Port | Purpose |
|---|---|---|---|
| Browser | `portal.example.com` | 443 | Pages, API, service worker |
| Browser | `auth.example.com` | 443 | OIDC redirects, avatars |
| Browser | `assets.example.com` | 443 | Lists, uploads, previews |
| Portal B | `auth.example.com` | 443 | Discovery, token, JWKS, revoke |
| Portal B | `auth-internal.example.com` | 443/private | Users, applications, backchannel proof |
| Portal B | `assets-internal.example.com` | 443/private | Project creation/repair |
| Portal B | PostgreSQL | 5432 | Portal data |
| Portal B | GitHub API | 443 | Repository metadata |
| Portal B | Push services | 443 | Web Push |
| Auth A | `portal.example.com/api/auth/backchannel-logout` | 443 | Logout and revocation webhooks |

Open only these paths. Do not expose PostgreSQL, the Auth internal listener, or
the Assets private listener to the public internet.

---

## 3. Verification checklist

Run these after both servers are configured.

### Auth discovery and issuer

```bash
curl -fsS https://auth.example.com/.well-known/openid-configuration | jq '.issuer'
# must print https://auth.example.com
```

### Internal API from Server B

```bash
curl -fsS \
  -H "Authorization: Bearer $BASIS_AUTH_RESOURCE_SECRET" \
  -H "x-basis-resource: $(python3 -c 'import urllib.parse;print(urllib.parse.quote("devconnect://noesis"))')" \
  "$BASIS_AUTH_INTERNAL_URL/internal/users/<a-real-user-uuid>"
```

A `401` means the shared secret or resource header is wrong. A timeout means the
private network path is missing.

### Portal sign-in

1. Open `https://portal.example.com`.
2. Sign in; the browser must redirect to `https://auth.example.com/oauth/authorize`.
3. Auth must redirect back to
   `https://portal.example.com/api/auth/callback/basis-auth`.
4. Confirm `GET /api/me` returns `200` with capabilities.

Common failure: `invalid_redirect_uri` means the Auth client still points at
`localhost` or the old origin.

### Assets CORS

```bash
curl -i -X OPTIONS https://assets.example.com/ \
  -H "Origin: https://portal.example.com" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: authorization"
```

The response must include the portal origin in `Access-Control-Allow-Origin` and
`Authorization` in `Access-Control-Allow-Headers`.

### Browser console

Open DevTools and check:

- No CSP violations for `connect-src`, `media-src`, or `frame-src`.
- No CORS errors when loading Assets.
- No mixed-content warnings (all three origins must be HTTPS).
- The service worker registers and `/sw.js` is not cached by the CDN.

### Backchannel logout

Sign out through Auth and confirm:

1. Auth calls `https://portal.example.com/api/auth/backchannel-logout`.
2. The portal session is cleared.
3. A revoked access token is rejected on the next API call.

### Notifications

Subscribe to push, then send a test assignment/mention. Confirm delivery on
Chrome, Firefox, and installed iOS. Push requires HTTPS and stable VAPID keys.

---

## 4. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `invalid_redirect_uri` | Auth client redirect URI uses the old host | Register `https://portal.example.com/api/auth/callback/...` exactly |
| Sign-in loops | `BASIS_AUTH_ISSUER` differs from token `iss`, or clock skew | Match the public issuer and enable NTP |
| `auth_unavailable` | Portal cannot reach Auth discovery/JWKS or internal API | Check DNS, firewall, TLS trust, `NODE_EXTRA_CA_CERTS` |
| `403 forbidden` on writes | `BASIS_PORTAL_ORIGIN` does not match the browser origin | Set the exact HTTPS origin, no path/trailing slash |
| Assets list works but uploads/previews fail | CORS or missing `Range`/exposed headers | Update Assets CORS and media handling |
| Video/audio preview blocked | CSP has no `media-src` for Assets | Already fixed in the portal; confirm the built CSP |
| HTML cache causes broken scripts | CDN cached SSR HTML with a stale nonce | Disable HTML caching |
| Backchannel 404/403 | Auth cannot reach Portal B, or URL not registered | Allow A → B and register the URL |
| Push subscription disappears | VAPID key or `NUXT_PUSH_TOKEN_KEY` changed | Keep keys stable; users must re-subscribe after rotation |
| Rate limits hit unexpectedly | Multiple clients behind one proxy IP | Use the forwarded client IP only from a trusted proxy |

---

## 5. Ownership summary

| Item | Owner | Where |
|---|---|---|
| Public issuer, clients, scopes, permission catalog | Auth team | Server A |
| Backchannel registration and outbound allowlist | Auth team | Server A |
| Internal API bind/network path and shared secret | Auth team + Portal team | A and B |
| Portal env, cookies, CSP, backchannel endpoint | Portal team | Server B |
| Assets CORS, Range, content headers | Assets team | Server B |
| DNS, TLS, reverse proxy, firewall | Infrastructure | A and B |
| Portal migrations, database, backups | Portal team | Server B or database host |
| VAPID keys and push delivery | Portal team | Server B |

---

## 6. Migration runbook: move Auth from B to A

The current setup runs Auth, Assets, and the portal on Server B. Use this order
to split Auth onto Server A without breaking sign-in.

1. **Provision Server A** with the same Auth version, its own PostgreSQL
   database, and the same secrets store. Do not point Auth at the portal
   database.
2. **Copy Auth data** from B to A using Auth’s supported backup/restore path.
   Stop writes during the final copy or use logical replication.
3. **Set the public issuer on A** to `https://auth.example.com` (`ISSUER`). All
   tokens issued after the move must carry that `iss`.
4. **Update Auth clients on A**:
   - Portal redirect URI becomes `https://portal.example.com/api/auth/callback/basis-auth`.
   - Assets redirect URI becomes `https://portal.example.com/api/auth/callback/assets`.
   - Backchannel URL becomes `https://portal.example.com/api/auth/backchannel-logout`.
   - `MANAGEMENT_PORTAL_*` and the shared resource secret are set on A.
5. **Open the network paths** from B to A: public issuer (443), internal API
   (443 or private port), and from A to B for the backchannel endpoint.
6. **Switch DNS** for `auth.example.com` to A and keep the old record warm until
   TTL expires.
7. **Update the portal environment on B** and restart it:
   - `BASIS_AUTH_ISSUER=https://auth.example.com`
   - `BASIS_AUTH_INTERNAL_URL=<A internal URL>`
   - keep `BASIS_PORTAL_ORIGIN=https://portal.example.com`.
8. **Force a re-login.** Tokens signed by the old issuer are rejected, so clear
   portal sessions or wait for expiration.
9. **Verify** discovery, sign-in, `/api/me`, Assets, backchannel logout, and
   push before removing Auth from B.
10. **Keep Assets on B** unless you also move it. If Assets gets a new public
    origin, update `NUXT_PUBLIC_BISZ_ASSETS_API_URL`, its CORS allowlist, and the
    portal CSP (the CSP reads the same env variable on restart).

