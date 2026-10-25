# BISZ Assets integration

The `/assets` page sends public and authenticated asset/project requests directly
from the browser to the BISZ Assets API. Management operations use a separate DevConnect Assets authorization-code
flow for client `66d015c8-1e3f-4a0d-b0f5-3bc3c6b72a86` and resource
`devconnect://assets.bisz.dev` with `assets.access`. Register
`http://localhost:4005/api/auth/callback/assets` on that confidential client.

Set `BASIS_ASSETS_CLIENT_SECRET` to the current confidential-client secret in
the portal's ignored `.env` or deployment secret store. It is not recoverable
from the Auth database. Set `BASIS_ASSETS_TOKEN_KEY` to a base64-encoded 32-byte
key and keep it stable: changing it invalidates stored Assets connections.
`BISZ_ASSETS_API_URL` is the server-side API URL; the public
`NUXT_PUBLIC_BISZ_ASSETS_API_URL` must be reachable from users' browsers for
public reads and direct uploads.

The portal checks that the Assets ID-token subject matches the signed-in portal
user and refuses the authorization-code login when they differ. It validates the
Assets access token's signature, issuer, audience, client,
scope, and subject, then stores access and rotating refresh tokens encrypted in
`asset_connections`. Refresh is serialized per user with a database row lock.
If refresh fails, the connection is removed and the page prompts for a new Assets login.

"Log out of Assets" removes the signed-in portal user's encrypted Assets
connection without ending the portal session, and clears the tab-scoped access
token so the user can run the Assets authorization flow again.

The browser obtains only the access JWT from a same-origin, no-store portal POST
and keeps it in tab-scoped `sessionStorage`, keyed by portal user ID. The refresh
token and confidential-client secret are never sent to browser code. Closing
the tab or signing out clears the browser JWT; an active portal session can
fetch another short-lived JWT. This does not eliminate XSS risk: any script
running in the portal origin can read that JWT while it is present. Avoid
untrusted scripts, HTML injection, and placing JWTs in URLs or logs.

The browser attaches the Assets bearer JWT to direct authenticated API calls,
including upload-session creation and multipart uploads. The upload session
token stays in memory and is revoked after each attempt. The Assets API now
requires `Assets.Assets.create` on the upload request itself, so it can identify
the uploader rather than relying only on the upload-session token. Upload
sessions are bound to the creating JWT subject, including for revocation; apply
`sql/008_upload_session_owners.sql` to the Assets database before deploying.

The asset catalog paginates object assets and returns only latest-version metadata.
The portal displays each object as a collapsed tree row and lazily requests the
newest-first version history from `GET /assets/{objectId}/versions` when that row
is expanded. Object-wide upload, latest-filename rename, and delete actions remain
on the object row; each version row provides its own immutable-version download.

The Assets service needs `sql/007_pending_asset_deletions.sql` before running
the new delete endpoint. Its queue records objects whose database rows were
deleted but whose bytes still need removal, and startup retries that cleanup.
