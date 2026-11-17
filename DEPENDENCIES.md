# External dependencies and integration contracts

This document is the authoritative inventory of every external service the
portal depends on, the exact API surface it uses, the credentials and network
paths involved, and what must change in sibling repositories when a contract
changes.

Update this file in the same change as any integration edit. It is reviewed as
part of the definition of done.

## 1. System context

```text
Browser
  |  same-origin HTTPS (session cookie)
  v
Portal (Nuxt/Nitro) ────────────────> PostgreSQL (portal database)
  |         |          |
  |         |          └─────────────> GitHub REST API (via GitHub App)
  |         |
  |         └───────────────────────> Basis Auth internal API (server-to-server)
  |                                           ^
  |  OIDC redirects                           |
  └──────────────> Basis Auth (DevConnect) ───┘

Browser ────────────────> DevConnect Assets API (direct, Bearer JWT)
Browser ────────────────> Browser push service (outbound, Web Push)
Browser ────────────────> Basis Auth avatar images
```

Dependencies marked required block the portal. Optional dependencies degrade
only the feature that uses them.

| Dependency | Required | Scope | Owner |
|---|---|---|---|
| Basis Auth (DevConnect) | Yes | Sign-in, users, applications, tokens | Auth team |
| PostgreSQL | Yes | All portal data | Portal team |
| DevConnect Assets | Only Assets screens/project creation | Files and asset projects | Assets team |
| GitHub API | No | Repository metadata/README | Portal team (GitHub App) |
| Browser push services | No | OS notifications | Browser vendors |
| Public DNS resolvers | No | GitHub API resolution only | Portal team config |

## 2. Basis Auth (DevConnect)

### 2.1 Repository and environments

| Item | Value |
|---|---|
| Local repository | `../basis-auth` (sibling checkout) |
| Local issuer | `http://localhost:3000` (`BASIS_AUTH_ISSUER`) |
| Local internal API | `http://localhost:3001` (`BASIS_AUTH_INTERNAL_URL`) |
| Production issuer | Configured per environment; HTTPS required |
| Portal callback | `${BASIS_PORTAL_ORIGIN}/api/auth/callback/basis-auth` |
| Assets callback | `${BASIS_PORTAL_ORIGIN}/api/auth/callback/assets` |
| Database | Basis Auth owns its own database; the portal must never point `DATABASE_URL` at it |

### 2.2 OIDC endpoints used

All endpoints are discovered from
`${BASIS_AUTH_ISSUER}/.well-known/openid-configuration` through
`openid-client`, but the contract the portal relies on is:

| Method | Path | Purpose | Notes |
|---|---|---|---|
| GET | `/.well-known/openid-configuration` | OIDC discovery | Cached by `openid-client` |
| GET | `/.well-known/oauth-authorization-server` | OAuth metadata | Discovery fallback |
| GET | `/oauth/authorize` | Authorization code + PKCE (Assets), portal login | Browser redirect |
| POST | `/oauth/token` | Code exchange, refresh token grant | `client_secret_basic` for confidential clients |
| GET | `/oauth/jwks` | Access-token signature keys | RS256, cached in-memory |
| GET | `/oauth/userinfo` | Not currently called | Reserved |
| POST | `/oauth/revoke` | Token revocation | Called on sign-out (refresh token) |
| GET/POST | `/oauth/logout` | Auth-side logout | Not called directly; portal clears its session |
| GET | `/api/picture/{userId}` | Avatar image | Public image endpoint, referenced by URL |

Portal scopes and resource:

```text
openid profile email offline_access noesis.access
resource: devconnect://noesis   (BASIS_AUTH_RESOURCE)
```

Assets scopes and resource:

```text
openid profile email offline_access assets.access
resource: BASIS_ASSETS_AUDIENCE
```

`noesis.access` and `assets.access` mean "may call the resource"; they do not
grant portal permissions. Every operation also checks delegated
`BiszPortal.*` permissions (and project membership where applicable).

### 2.3 Token and claims contract

The portal validates every access token in `server/utils/portal-auth-tokens.ts`
and `server/utils/assets-auth.ts`.

Required properties:

| Claim/Header | Requirement |
|---|---|
| Algorithm | `RS256` |
| Type | `at+jwt` |
| Issuer | Exact `BASIS_AUTH_ISSUER` |
| Audience | `BASIS_AUTH_RESOURCE` for portal; `BASIS_ASSETS_AUDIENCE` for Assets |
| Subject | Matches the portal session user UUID |
| Client ID | `BASIS_AUTH_CLIENT_ID` for portal; `BASIS_ASSETS_CLIENT_ID` for Assets |
| Scope | Contains `noesis.access` or `assets.access` |
| Expiry | Enforced by `jose`; refresh 60 seconds before expiry |
| Permissions | Delegated `BiszPortal.*` strings from the portal application catalog |

Refresh tokens rotate on every refresh. A missing rotated token is a failure.
Portal tokens are encrypted with AES-256-GCM at rest in
`portal_auth_tokens`; the key derives from `NUXT_APP_SECRET` (with `NUXT_SESSION_PASSWORD` supported as a legacy alias).

### 2.4 Internal API endpoints used

Base URL: `BASIS_AUTH_INTERNAL_URL`. Headers:

```text
Authorization: Bearer <BASIS_AUTH_RESOURCE_SECRET>
x-basis-resource: <URL-encoded BASIS_AUTH_RESOURCE>
x-basis-actor-token: Bearer <signed-in user's portal access token>
Cache-Control: no-store
```

| Method | Path | Portal use | Permission |
|---|---|---|---|
| GET | `/internal/users/{userId}` | Validate member UUID, resolve display name | Internal token only |
| GET | `/internal/users` | List users (page/pageSize, max 100) | `BiszPortal.Users.read` on actor |
| GET | `/internal/users/{userId}/picture` | Not used (avatars use public issuer route) | Internal token only |
| PATCH | `/internal/users/{userId}` | Not used by the portal | Internal token only |
| GET | `/internal/management/users/{userId}` | User detail + permission catalog | `BiszPortal.Users.read` |
| PATCH | `/internal/management/users/{userId}` | Profile/grants update | `BiszPortal.Users.update` |
| GET | `/internal/applications` | Application list + organizations | `BiszPortal.Applications.read` |
| POST | `/internal/applications` | Create application | `BiszPortal.Applications.create` |
| GET | `/internal/applications/{clientId}` | Application detail | `BiszPortal.Applications.read` |
| PATCH | `/internal/applications/{clientId}` | Update settings | `BiszPortal.Applications.update` |
| DELETE | `/internal/applications/{clientId}` | Delete application | `BiszPortal.Applications.delete` |
| POST | `/internal/applications/{clientId}/credentials` | Rotate secret | `BiszPortal.ApplicationCredentials.manage` |
| DELETE | `/internal/applications/{clientId}/credentials` | Remove secret | `BiszPortal.ApplicationCredentials.manage` |
| POST | `/internal/applications/{clientId}/owners` | Add owner | `BiszPortal.ApplicationOwners.manage` |
| PATCH | `/internal/applications/{clientId}/owners/{userId}` | Update owner role | `BiszPortal.ApplicationOwners.manage` |
| DELETE | `/internal/applications/{clientId}/owners/{userId}` | Remove owner | `BiszPortal.ApplicationOwners.manage` |
| POST | `/internal/applications/{clientId}/resources/attach` | Attach existing resource | `BiszPortal.ApplicationResources.manage` |
| POST | `/internal/applications/{clientId}/resources` | Create resource | `BiszPortal.ApplicationResources.manage` |
| PATCH | `/internal/applications/{clientId}/resources` | Update resource | `BiszPortal.ApplicationResources.manage` |
| DELETE | `/internal/applications/{clientId}/resources` | Remove resource | `BiszPortal.ApplicationResources.manage` |
| PUT | `/internal/applications/{clientId}/scopes` | Update resource scopes | `BiszPortal.ApplicationScopes.manage` |
| POST | `/internal/applications/{clientId}/permissions` | Create permission | `BiszPortal.ApplicationPermissions.manage` |
| PATCH | `/internal/applications/{clientId}/permissions` | Update permission | `BiszPortal.ApplicationPermissions.manage` |
| DELETE | `/internal/applications/{clientId}/permissions` | Delete permission | `BiszPortal.ApplicationPermissions.manage` |
| PUT | `/internal/applications/{clientId}/default-permissions` | Update defaults | `BiszPortal.ApplicationPermissions.manage` |
| PUT | `/internal/applications/{clientId}/redirect-uris` | Update redirect URIs | `BiszPortal.ApplicationRedirectUris.manage` |

Actor validation on Auth side requires:

```text
gty != client_credentials
client_id == MANAGEMENT_PORTAL_CLIENT_ID
scope contains MANAGEMENT_PORTAL_SCOPE (noesis.access)
signature/issuer/audience valid
```

The portal must set these Auth-side variables to match:

```text
MANAGEMENT_PORTAL_CLIENT_ID=BASIS_AUTH_CLIENT_ID
MANAGEMENT_PORTAL_AUDIENCE=BASIS_AUTH_RESOURCE
MANAGEMENT_PORTAL_SCOPE=noesis.access
```

### 2.5 Permission catalog contract

The portal application in Basis Auth must contain every permission string from
`shared/permissions.ts`:

```text
BiszPortal.Projects.read|create|update|archive
BiszPortal.Projects.comment.me|others
BiszPortal.ProjectMembers.manage
BiszPortal.Tasks.read|create|update
BiszPortal.Tasks.comment.me|others
BiszPortal.Tags.read|create|delete
BiszPortal.Incidents.read|create|update
BiszPortal.Calendar.read
BiszPortal.Users.read|update
BiszPortal.ExportCSV.create
BiszPortal.Applications.read|create|update|delete
BiszPortal.ApplicationOwners.manage
BiszPortal.ApplicationResources.manage
BiszPortal.ApplicationScopes.manage
BiszPortal.ApplicationPermissions.manage
BiszPortal.ApplicationRedirectUris.manage
BiszPortal.ApplicationCredentials.manage
```

Rules:

- Permission grammar: dot-separated, group segments upper camel case, a
  lower-camel behavior segment last (`@basis/schema/permissions`).
- Project owners use `Projects.comment.me`. Other project members use
  `Projects.comment.others`. Task creators and assignees use `Tasks.comment.me`.
  Other members of the task's project use `Tasks.comment.others`. Commenting
  also requires read access to the target and an active project.
- A permission catalog change requires coordinating with the Auth repo: add
  the definition, bump the application catalog version, and re-grant users.
  Users receive the new catalog version; stale versions return `409
  stale_permissions` on user updates.
- `DelegatedPermissionSet` supports `.all` wildcards. Do not assume exact
  strings only.

### 2.6 Configuration

Portal side:

| Variable | Required | Purpose |
|---|---|---|
| `BASIS_AUTH_ISSUER` | Yes | OIDC issuer / JWKS / avatar origin |
| `BASIS_AUTH_CLIENT_ID` | Yes | Portal confidential client |
| `BASIS_AUTH_CLIENT_SECRET` | Yes | `client_secret_basic` |
| `BASIS_AUTH_RESOURCE` | Yes | Portal audience (`devconnect://noesis`) |
| `BASIS_AUTH_INTERNAL_URL` | Yes | Internal API base |
| `BASIS_AUTH_RESOURCE_SECRET` | Yes | Internal API bearer token |
| `BASIS_PORTAL_ORIGIN` | Yes | Callback and CSRF origin |
| `NUXT_APP_SECRET` | Yes | Session sealing and token-encryption key derivation |

Auth side (must match):

| Variable | Purpose |
|---|---|
| `ISSUER` | Must equal `BASIS_AUTH_ISSUER` |
| `MANAGEMENT_PORTAL_CLIENT_ID` | Must equal `BASIS_AUTH_CLIENT_ID` |
| `MANAGEMENT_PORTAL_AUDIENCE` | Must equal `BASIS_AUTH_RESOURCE` |
| `MANAGEMENT_PORTAL_SCOPE` | Must equal `noesis.access` |
| Internal API token | Must equal `BASIS_AUTH_RESOURCE_SECRET` |
| Database | Auth's own PostgreSQL database |

### 2.7 Registration runbook

1. In Basis Auth, create a confidential OIDC client for the portal.
2. Redirect URI: `${BASIS_PORTAL_ORIGIN}/api/auth/callback/basis-auth`.
3. Grant scopes: `openid profile email offline_access noesis.access`.
4. Resource/audience: `devconnect://noesis`.
5. Link the client to the required organizations.
6. Add the `BiszPortal.*` permission catalog and publish a catalog version.
7. Affiliate users with the client and grant permissions.
8. Copy the client ID/secret into the portal environment.
9. Set `BASIS_AUTH_RESOURCE_SECRET` to the same value on both services.
10. Verify `/api/me` returns capabilities and a page loads.

For Assets, repeat with a second confidential client:

- Redirect URI `${BASIS_PORTAL_ORIGIN}/api/auth/callback/assets`
- Scope `assets.access`
- Resource `${BASIS_ASSETS_AUDIENCE}`

### 2.8 Errors, limits, and failure behavior

| Condition | Portal behavior |
|---|---|
| Discovery/JWKS unreachable | `/api/me` and authenticated APIs return `auth_unavailable` (502) |
| Invalid/expired token | Refresh once; if refresh fails, clear session and return `invalid_session` (401) |
| `429` from token endpoint | Surface transient auth error; retry is bounded by the refresh window |
| Internal API `404` | Treat user as missing for member validation |
| Internal API `5xx` | Fail the operation; never silently invent users |
| Picture `404` | Render initials |
| Permission missing | 403 `forbidden` |
| Catalog drift on user save | 409 `stale_permissions`; the UI reloads |

Rate limits on Auth: token/revoke/authorize/interaction/callback/client routes
are rate-limited. The portal respects `Retry-After` and does not retry unsafe
operations automatically.

### 2.9 Recommended upstream changes (not required)

These are portal-side optimizations that need Auth-side cooperation. Until
they land, the portal caches and caps as documented.

1. `GET /internal/users?ids=uuid,uuid` (max 200) to replace one HTTP call per
   member with one batch call.
2. `GET /internal/users?search=` for true server-side user search. Today the
   portal requests one page of 100 users and filters locally, so global user
   search is capped.
3. Contract tests in the Auth repo for the exact JSON shapes the portal parses.

## 3. DevConnect Assets

### 3.1 Configuration

| Variable | Required | Purpose |
|---|---|---|
| `BASIS_ASSETS_CLIENT_ID` | Yes for Assets | Confidential OIDC client |
| `BASIS_ASSETS_CLIENT_SECRET` | Yes for Assets | Client secret |
| `BASIS_ASSETS_AUDIENCE` | Yes in production | Token audience |
| `BASIS_ASSETS_TOKEN_KEY` | Yes for Assets | 32-byte base64 key encrypting stored Assets tokens |
| `BISZ_ASSETS_API_URL` | Yes for Assets | Server-side Assets API base |
| `NUXT_PUBLIC_BISZ_ASSETS_API_URL` | Yes for Assets | Browser-reachable API base |
| Assets callback | - | `${BASIS_PORTAL_ORIGIN}/api/auth/callback/assets` |

`NUXT_PUBLIC_BISZ_ASSETS_API_URL` must be reachable from users' browsers and
must allow the portal origin via CORS.

### 3.2 Endpoints used

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/project` | None (public list) / Bearer | List asset projects, link checks |
| POST | `/project` | Bearer | Create an Assets project |
| PUT | `/project/{uid}` | Bearer | Rename/update an asset project |
| DELETE | `/project/{uid}` | Bearer | Delete an asset project |
| GET | `/` (root, `?page&pageSize&projectUid`) | Optional Bearer | List assets, latest version metadata |
| GET | `/assets/{objectId}/versions` | Bearer | Version history |
| PATCH | `/assets/{objectId}` | Bearer | Rename latest filename |
| DELETE | `/assets/{objectId}` | Bearer | Delete object and versions |
| GET | `/{objectId}/{version}` | Optional Bearer | Download/preview bytes |
| POST | `/sessions` | Bearer | Create upload session |
| DELETE | `/sessions` | Bearer + session token | Revoke upload session |
| POST | `/assets` | Bearer + `X-Upload-Session-Token` | Multipart upload/new version |

Upload manifest:

```json
{
  "files": [
    { "fieldName": "file0" },
    { "fieldName": "file1", "objectId": "existing-object-for-new-version" }
  ]
}
```

Limits enforced by the portal client: at most 20 files, each at most 100 MiB,
one file when uploading a new version.

### 3.3 Assets JWT contract

The portal validates Assets access tokens with `jose` before storing them:

```text
alg=RS256, typ=at+jwt
iss=BASIS_AUTH_ISSUER
aud=BASIS_ASSETS_AUDIENCE
client_id=BASIS_ASSETS_CLIENT_ID
scope contains assets.access
sub == signed-in portal user ID
```

Required delegated Assets permissions:

```text
Assets.Projects.create   (portal project creation + Assets project management)
Assets.Assets.create     (upload request)
```

Tokens are refreshed with a rotating refresh token under a per-user database
row lock. The refresh token and client secret never reach the browser. The
browser holds only a short-lived access JWT in tab-scoped `sessionStorage`,
keyed by portal user ID.

### 3.4 CORS and browser contract

The browser calls the Assets API directly. Required CORS:

- Allowed origin: the portal origin.
- Allowed methods: `GET, POST, PUT, PATCH, DELETE, OPTIONS`.
- Allowed request headers: `Authorization`, `Content-Type`,
  `X-Upload-Session-Token`.
- Exposed response headers: `Content-Type`, `Content-Disposition`,
  `Content-Length`, `ETag`, `Cache-Control`, `Accept-Ranges`,
  `Content-Range`.
- `OPTIONS` preflight must not require credentials; the portal sends
  `credentials: "omit"`.
- `Range` support is required for streaming large media previews/downloads.
- Correct `Content-Type` is required for safe previews.

Without CORS the Assets feature is unusable even though the portal API works.

### 3.5 Error contract

Assets returns JSON errors shaped like:

```json
{ "error": "code", "message": "human readable", "error_description": "optional detail" }
```

| Status | Portal behavior |
|---|---|
| 401 | Clear stored browser JWT, refresh access token once, retry once |
| 403 | Show permission message; do not retry |
| 404 | Treat object/project as missing |
| 413/415 | Show upload/type limits |
| 429 | Show retry-after; do not hammer |
| 5xx | Show degraded message; preserve local state |

### 3.6 Assets-owned migrations

The Assets repo owns its schema. The portal documentation references:

- `sql/007_pending_asset_deletions.sql`
- `sql/008_upload_session_owners.sql`

These must be applied in the Assets deployment before the corresponding
portal features are enabled. The portal does not run migrations against the
Assets database.

### 3.7 Known drift

- The code default for `BASIS_ASSETS_AUDIENCE` is
  `https://assets.devconnect.org`, while older portal docs mention
  `devconnect://assets.bisz.dev`. The environment value is authoritative; the
  portal must fail fast if it is missing in production. This document is the
  source of truth.
- `BASIS_ASSETS_CLIENT_ID` has a development default; production must set it
  explicitly.

### 3.8 Recommended upstream changes

1. Server-side asset search and sort (`?q=&sort=`) to replace client-only
   filtering of the current page.
2. `Range` support on byte downloads for media previews.
3. Expose `HEAD` for metadata.

## 4. GitHub API and GitHub App

### 4.1 Configuration

| Variable | Required | Purpose |
|---|---|---|
| `GITHUB_APP_ID` | No | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY_PATH` | No | Absolute or portal-relative PEM path |
| `GITHUB_DNS_SERVERS` | No | Comma-separated DNS resolvers used only for GitHub |

### 4.2 App permissions

- Repository `Contents: read`
- Repository `Metadata: read`

The app must be installed on the repositories users link. Repository URLs are
strictly `https://github.com/{owner}/{repo}` (no ports, credentials, query, or
fragment).

### 4.3 Endpoints used

| Method | Path | Purpose |
|---|---|---|
| GET | `/repos/{owner}/{repo}/installation` | Resolve installation for a repository |
| POST | `/app/installations/{installationId}/access_tokens` | Create installation token |
| GET | `/repos/{owner}/{repo}` | Repository metadata |
| GET | `/repos/{owner}/{repo}/readme` | README content (base64) |

Headers:

```text
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2026-03-10
User-Agent: bisz-portal
Authorization: Bearer <app JWT or installation token>
```

### 4.4 Behavior

- Installation IDs and tokens are cached in memory; tokens are reused until
  5 minutes before expiry.
- Requests use a 15-second timeout and a custom undici dispatcher with the
  configured DNS servers.
- GitHub `404` on installation means "App not installed"; `401/403` means
  credentials/permissions rejected; `403/429` maps to a rate-limit error.
- README HTML is sanitized by the portal's Markdown renderer before display.
- If GitHub credentials are absent, repository validation returns a
  configuration error and the rest of the portal works.

## 5. PostgreSQL

| Item | Requirement |
|---|---|
| Version | PostgreSQL 15+ |
| Database | Portal-owned only; never the Auth database |
| Connection | `DATABASE_URL` |
| Extensions | `pgcrypto` for `gen_random_uuid()` if the server lacks `gen_random_uuid`; `pg_trgm` optional for prefix search |
| Pool | Bounded pool; statement/query timeouts; idle reaping |
| Migrations | Owned by the portal (`drizzle/`), append-only, run before deploy |
| Backups | Daily full + PITR; include the portal database only |
| Roles | App role with DML on portal tables; migration role with DDL |
| SSL | Required outside localhost |
| Monitoring | Connection count, slow queries, lock waits, replication lag |

Required new tables/indexes are listed in the implementation migration. The
portal also stores encrypted portal and Assets tokens; those rows are
security-sensitive.

## 6. Browser push services (Web Push)

### 6.1 Configuration

| Variable | Required | Purpose |
|---|---|---|
| `NUXT_VAPID_PUBLIC_KEY` | Push only | Public VAPID key (safe to expose) |
| `NUXT_VAPID_PRIVATE_KEY` | Push only | Private VAPID key (server-only) |
| `NUXT_VAPID_SUBJECT` | Push only | `mailto:` or origin contact |
| `NUXT_PUBLIC_PUSH_ENABLED` | Push only | UI feature flag |
| `NUXT_PUSH_TOKEN_KEY` | Optional | 32-byte base64 key encrypting subscription auth secrets; falls back to a domain-separated derivation from `NUXT_APP_SECRET` |

Generate keys with `bun run vapid:generate`. Keep the private key stable; a
change invalidates every subscription and requires users to re-enable push.

### 6.2 Endpoint allowlist

The server accepts subscription endpoints only when they are HTTPS, port 443,
contain no credentials or IP literals, and match one of:

```text
https://fcm.googleapis.com/...
https://updates.push.services.mozilla.com/...
https://web.push.apple.com/...
https://*.notify.windows.com/...
```

This prevents SSRF and subscription spoofing. Unknown services are rejected.

### 6.3 Payload and transport

- RFC 8291 `aes128gcm` encryption using the subscription `p256dh` and `auth`
  secret.
- RFC 8292 VAPID JWT (ES256) in `Authorization: vapid t=..., k=...`.
- Headers: `Content-Encoding: aes128gcm`, `TTL: 3600`, `Urgency` by type.
- Payload limit 4096 bytes; the portal sends compact JSON:
  `{"title","body","url","tag","icon","badge"}`.
- `404`/`410` removes the subscription; `429`/`5xx` retries with backoff;
  repeated `401`/`403` disables the subscription.
- `pushsubscriptionchange` in the service worker re-subscribes and posts the
  new subscription to the portal.

### 6.4 Browser requirements

| Platform | Requirement |
|---|---|
| Chrome/Edge desktop + Android | Works with HTTPS |
| Firefox desktop + Android | Works with HTTPS |
| Safari macOS 16.4+ | Works when added to the Dock as a web app |
| iOS/iPadOS 16.4+ | Only in an installed Home Screen web app |
| Older browsers | In-app notifications only |

Push requires HTTPS except `localhost` development.

## 7. Public DNS resolvers

| Item | Value |
|---|---|
| Variables | `GITHUB_DNS_SERVERS=1.1.1.1,8.8.8.8` |
| Scope | Only GitHub API requests |
| Protocol | DNS over UDP/TCP port 53 from the portal host |
| Fallback | If GitHub DNS is unreachable, GitHub features fail; other services use system DNS |
| Firewall | Allow egress 53/UDP and 53/TCP to the configured resolvers, and 443 to GitHub |

## 8. Network egress matrix

| Source | Destination | Port | Protocol | Auth | Purpose |
|---|---|---|---|---|---|
| Portal | Basis Auth issuer | 443 (3000 local) | HTTPS | OIDC client | Discovery, token, JWKS, revoke |
| Portal | Basis Auth internal | 443 (3001 local) | HTTPS | Internal bearer + actor token | Users, applications |
| Portal | PostgreSQL | 5432 | TCP | Password/mTLS | Data |
| Portal | Assets API (server) | 443 (5000 local) | HTTPS | Bearer JWT | Project creation/repair |
| Browser | Assets API (public) | 443 | HTTPS | Bearer JWT | Assets, uploads, previews |
| Browser | Basis Auth | 443 | HTTPS | None | OIDC redirects, avatars |
| Portal | GitHub API | 443 | HTTPS | GitHub App | Repository metadata/README |
| Portal | Push services | 443 | HTTPS | VAPID | Deliver notifications |
| Browser | Push services | 443 | HTTPS | Subscription | Receive notifications |
| Portal | DNS resolvers | 53 | UDP/TCP | None | GitHub hostname resolution |

## 9. Secrets and rotation

| Secret | Purpose | Rotation | Blast radius |
|---|---|---|---|
| `NUXT_APP_SECRET` | Session sealing + token key derivation | Requires re-login | All portal sessions and encrypted tokens |
| `BASIS_AUTH_CLIENT_SECRET` | Portal OIDC client | Coordinate with Auth | Sign-in/token refresh |
| `BASIS_AUTH_RESOURCE_SECRET` | Internal API access | Coordinate with Auth | User/app management |
| `BASIS_ASSETS_CLIENT_SECRET` | Assets OIDC client | Coordinate with Auth/Assets | Assets sign-in |
| `BASIS_ASSETS_TOKEN_KEY` | Encrypt stored Assets tokens | Requires reconnecting Assets | All Assets connections |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App JWT signing | Rotate key in GitHub App | Repository features |
| `NUXT_VAPID_PRIVATE_KEY` | Push signing | Requires re-subscription | All push subscriptions |
| `NUXT_PUSH_TOKEN_KEY` | Encrypt subscription auth secrets | Requires re-subscription | Push encryption |
| `DATABASE_URL` | DB access | Coordinate with DB | Everything |

Never expose server secrets through `NUXT_PUBLIC_*`, API responses, logs, or
client bundles. Only the VAPID public key is intentionally public.

## 10. Local development runbook

| Service | Port | Notes |
|---|---|---|
| Basis Auth | 3000 | OIDC issuer |
| Basis Auth internal | 3001 | Internal API |
| Portal | 4005 | `bun run dev` |
| Assets API | 5000 | `BISZ_ASSETS_API_URL` |
| PostgreSQL | 5432 | `DATABASE_URL` |

Steps:

1. `bun install`.
2. Copy `.env.example` to `.env` and fill required values.
3. Create the portal database and run `bun run db:setup`.
4. Register both OIDC clients in the local Auth instance.
5. Confirm `BASIS_AUTH_RESOURCE_SECRET` matches on both services.
6. Start Assets locally or set both Assets URLs to the dev instance.
7. `bun run dev` and sign in.
8. Optional: generate VAPID keys and enable `NUXT_PUBLIC_PUSH_ENABLED`.

## 11. Health, SLOs, and failure modes

| Dependency | Health signal | SLO target | Degraded behavior |
|---|---|---|---|
| Basis Auth | `/api/me` succeeds; JWKS reachable | 99.9% | Sign-in unavailable; existing sessions may fail on refresh |
| PostgreSQL | `/api/health` DB ping | 99.95% | Portal unavailable |
| Assets | Connection endpoint + a list call | 99.5% | Assets screens show connection error |
| GitHub | Repository validation success | Best effort | Repository card shows unavailable |
| Push | Delivery acceptance rate | Best effort | In-app notifications continue |

`GET /api/health` reports database reachability and configuration presence
without exposing secrets. It returns 503 when the database is down.

## 12. Change management

- Every integration change updates this file and the relevant contract test
  fixtures.
- Additive API changes are preferred. Breaking changes require a coordinated
  release window.
- Permission catalog changes require an Auth release plus a portal release.
- Assets CORS, upload, and token-contract changes require an Assets release
  plus a portal release.
- GitHub API version changes are pinned by the `X-GitHub-Api-Version` header.
- `@basis/schema` is pinned by the `packages/basis-schema` git submodule.
  Bump the submodule, install, run typecheck/tests, and review permission and
  envelope changes before merging.

## 13. Deliberately not used

No email/SMS provider, analytics, CDN, Redis/queue, cloud object storage,
external identity provider beyond Basis Auth, or third-party error tracking.
Everything else is bundled in the portal or owned by the services above.

## 14. Running the portal on its own server

See [`EXTERNAL_REQUIREMENTS.md`](./EXTERNAL_REQUIREMENTS.md) for the full
Server A (Auth) / Server B (Assets + Portal) contract and migration runbook.

The portal can run on a host that is separate from Basis Auth and DevConnect
Assets. The browser always talks to the public portal origin; all service-to-
service traffic uses the URLs below.

### 14.1 Portal environment contract

| Variable | Public/private | Notes |
|---|---|---|
| `BASIS_PORTAL_ORIGIN` | Public | Exact HTTPS origin users visit. No path, query, or fragment. Used for OIDC redirects, CSRF, HSTS, backchannel URL, and secure cookies. |
| `BASIS_AUTH_ISSUER` | Public | Must match the `iss` claim in Auth tokens. Also used for avatar URLs. |
| `BASIS_AUTH_INTERNAL_URL` | Private | Auth internal listener; not necessarily the public issuer. |
| `BASIS_AUTH_RESOURCE_SECRET` | Private | Shared with Auth; sent as `Authorization: Bearer` plus `x-basis-resource`. |
| `BISZ_ASSETS_API_URL` | Private | Server-side Assets base URL. |
| `NUXT_PUBLIC_BISZ_ASSETS_API_URL` | Public | Browser-reachable Assets base URL. Must allow the portal origin via CORS. |
| `DATABASE_URL` | Private | Portal-only PostgreSQL. Never the Auth database. |
| `NUXT_APP_SECRET` | Private | At least 32 characters. Identical on every portal instance. |

### 14.2 Required reverse proxy behavior

- Terminate TLS and forward `Host` unchanged.
- Set `X-Forwarded-Proto: https` and `X-Forwarded-For`.
- Do not cache SSR HTML: CSP nonces are generated per request.
- Cache only `/_nuxt/**`, `/icons/**`, and the font files.
- Keep `/sw.js` revalidated (`no-cache`).
- Do not expose the Nitro process directly; otherwise clients can spoof
  `X-Forwarded-For` and the rate limiter key.

### 14.3 Network paths that must exist

| Source | Destination | Purpose |
|---|---|---|
| Browser | Portal public origin | Pages, API, service worker, push subscription |
| Browser | Auth public issuer | OIDC redirects, avatar images |
| Browser | Assets public URL | Direct asset list, upload, preview |
| Portal host | Auth public issuer | Discovery, token, JWKS, revoke |
| Portal host | Auth internal URL | Users, applications, backchannel proof |
| Portal host | Assets private URL | Project creation and repair |
| Portal host | PostgreSQL | All portal data |
| Portal host | GitHub 443 + DNS 53 | Repository metadata |
| Portal host | Push services 443 | Web Push delivery |
| Auth host | `${BASIS_PORTAL_ORIGIN}/api/auth/backchannel-logout` | Backchannel logout and revoke webhooks |

### 14.4 Registration checklist outside this repository

1. Basis Auth: add `${BASIS_PORTAL_ORIGIN}/api/auth/callback/basis-auth` and
   `${BASIS_PORTAL_ORIGIN}/api/auth/callback/assets` as allowed redirect URIs.
2. Basis Auth: register the backchannel URL above for `BASIS_AUTH_RESOURCE`.
3. Basis Auth: set `MANAGEMENT_PORTAL_CLIENT_ID`, `MANAGEMENT_PORTAL_AUDIENCE`,
   and `MANAGEMENT_PORTAL_SCOPE` to match the portal client.
4. Basis Auth: share `BASIS_AUTH_RESOURCE_SECRET` with the portal.
5. Assets: allow the portal origin, `Authorization`, `Content-Type`,
   `X-Upload-Session-Token`, and expose `Content-Type`,
   `Content-Disposition`, `Content-Length`, `ETag`, `Cache-Control`,
   `Accept-Ranges`, and `Content-Range`. Support `Range` for media.
6. DNS/TLS: make the portal origin valid for the public certificate and keep
   the Auth internal certificate trusted by the portal host
   (`NODE_EXTRA_CA_CERTS` if it is a private CA).
7. Portal DB: run `bun run db:migrate` before starting the new build and keep
   the database reachable only from portal hosts.

### 14.5 Multi-instance notes

- Sealed session cookies need no sticky sessions, but every instance must use
  the same `NUXT_APP_SECRET` and database.
- Rate limits are process-local; they are not global across instances.
- Due-notification sweeps and the push queue use PostgreSQL advisory locks, so
  duplicate instances are safe.
- Maintenance cleanup is idempotent but runs per instance.
- Rotating `NUXT_VAPID_PRIVATE_KEY` or `NUXT_PUSH_TOKEN_KEY` invalidates all
  browser push subscriptions.
