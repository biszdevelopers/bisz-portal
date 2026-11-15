# Basis authentication and API contracts

`bisz-portal` signs users in through the sibling `basis-auth` service (user-facing name: DevConnect) using OpenID Connect. Nuxt Auth Utils manages the encrypted browser session, while Basis Auth issues the access token used to call BISZ Portal application APIs.

## Configuration

Register a confidential client in `basis-auth` with this callback URL:

```text
http://localhost:4005/api/auth/callback/basis-auth
```

Copy `.env.example` to `.env.local` and provide the registered client ID and secret. Set `BASIS_PORTAL_ORIGIN` to the public portal origin and use a unique `NUXT_SESSION_PASSWORD` of at least 32 random characters. For loopback HTTP origins (`localhost`, `127.0.0.1`, or `::1`), the portal deliberately issues a non-`Secure` development session cookie. All non-loopback environments require HTTPS. Secrets belong only in ignored environment files or the deployment secret store.

The client requests `openid profile email offline_access noesis.access` for the `devconnect://noesis` resource. `offline_access` makes Basis Auth issue a rotating refresh token, which the portal retains alongside the access token in server-only encrypted session data. The local portal session uses the same 30-day maximum lifetime as the Basis Auth refresh-token family. `noesis.access` only indicates that the access token may access BISZ Portal. It does not contain or imply permissions; every operation still requires its delegated `BiszPortal.*` permission.

The portal's `BASIS_AUTH_CLIENT_ID` and `BASIS_AUTH_RESOURCE` must match Basis Auth's `MANAGEMENT_PORTAL_CLIENT_ID` and `MANAGEMENT_PORTAL_AUDIENCE`. The portal scope is `noesis.access`, matching `MANAGEMENT_PORTAL_SCOPE`. Basis Auth validates those three actor-token properties before any internal application-management operation runs.

Set the server-only `BASIS_AUTH_RESOURCE_SECRET` to the secret for `BASIS_AUTH_RESOURCE`. To rotate it, use **Rotate secret** in that resource's **Secret** tab and copy the value Basis Auth issues. Update the portal environment immediately and reload it so internal API requests use the new credential.

## Basis Auth backchannel

Apply the portal database migrations with `bun run db:migrate` before starting the updated portal. Set `BASIS_AUTH_INTERNAL_URL` to the Basis Auth internal listener. In **Resource Servers → Backchannel**, register `${BASIS_PORTAL_ORIGIN}/api/auth/backchannel-logout` for `BASIS_AUTH_RESOURCE`, using the actual portal origin. Basis Auth must be able to reach that URL over HTTPS or over HTTP with the hostname `localhost`. For initial setup before portal sign-in works, set `backchannelLogoutUri` in the resource's `OIDC_RESOURCES_JSON` entry on Basis Auth.

The portal answers webhook challenges using the configured resource secret. It verifies signed logout events and ends the subject's local sessions. Signed access-token revocations are stored by JTI in the shared PostgreSQL denylist and take effect at `valid_after`. An hourly cleanup removes entries that are at least one hour past issuance and whose signed access-token expiration, when available, has passed.

The **Sessions** tab on `/users/<uid>` lists active Basis Auth authorization sessions across resources. Users can manage their own sessions. Viewing another user's sessions requires `BiszPortal.Users.read`, and ending one requires `BiszPortal.Users.update`. Force ending a session asks Basis Auth to disable its refresh grant and send an immediate access-token revocation to that session's resource. The portal rejects the revoked JTI during normal authentication and returns `401 invalid_session` on subsequent requests using that token.

## Application API requirements

Every BISZ Portal application endpoint under `server/api` must:

1. Require the encrypted, HttpOnly Nuxt session cookie unless explicitly public. Do not accept the Basis access token from browser JavaScript or an `Authorization` header.
2. Read the Basis access token retained inside the server-only `secure` session data, then validate its signature, `RS256` algorithm, issuer, `at+jwt` type, configured `BASIS_AUTH_RESOURCE` audience, expiration, and `noesis.access` scope.
3. Parse token claims with `accessTokenClaimsSchema` from `@basis/schema/auth`.
4. Return `APIResponse` or `APIError` envelopes from `@basis/schema/api` through `apiResult`.
5. Treat `noesis.access` as access only, never as a permission.

The OIDC handler under `/api/auth/callback/basis-auth` and the Basis Auth webhook under `/api/auth/backchannel-logout` follow their protocol response formats.

Use `authenticateRequest` and `apiResult` instead of reimplementing these rules:

```ts
import { apiResult } from "~/server/utils/api-response";
import { authenticateRequest } from "~/server/utils/api-auth";
import { APIError, APIResponse } from "~/server/utils/basis-schema";

export default defineEventHandler(async (event) => {
  const authentication = await authenticateRequest(event);
  if (authentication instanceof APIError)
    return apiResult(event, authentication);

  return apiResult(
    event,
    new APIResponse({ userId: authentication.claims.sub }),
  );
});
```

A successful response always contains the Basis Schema envelope:

```json
{ "userId": "...", "status": 200, "code": 200 }
```

Errors use the corresponding schema:

```json
{
  "status": 401,
  "code": "invalid_session",
  "error": "invalid_session",
  "error_description": "Invalid access token"
}
```

## Reading the signed-in user

The Overview page is the live reference. After the OIDC flow completes, it initializes the user from the validated ID-token claims and retains the short-lived Basis access token and refresh token inside Nuxt Auth Utils' encrypted, HttpOnly session cookie. The compact ID-token picture URL is used instead of the potentially large UserInfo data URL so the sealed session stays within browser cookie limits. Both tokens are stored in server-only `secure` session data, which Nuxt Auth Utils omits from its client session endpoint.

The page calls `/api/me` using the same-origin cookie only. `/api/me` decrypts the Nuxt session server-side, retrieves and validates the embedded Basis access token, and returns the OIDC profile fields already retained in that encrypted session.

Client request example:

```ts
const response = await fetch("/api/me");
```

Never expose either token through component props, Nuxt session JSON, browser storage, logs, or API responses. Never forward the Basis Auth browser cookie or expose the client secret. The portal now acquires offline access at login and securely retains the refresh token; automatic access-token rotation is intentionally handled separately.

For UI-only identity checks in a Nuxt server route, use the Nuxt session:

```ts
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event);
  if (!session?.user) return { userId: null };

  return { userId: session.user.id };
});
```

The Nuxt session cookie establishes the local portal session, but the embedded Basis-issued access token remains the authority for BISZ Portal API access. `authenticateRequest` validates both layers before a route continues.
