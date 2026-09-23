# Basis authentication and API contracts

`bisz-portal` signs users in through the sibling `basis-auth` service (user-facing name: DevConnect) using OpenID Connect. Nuxt Auth Utils manages the encrypted browser session, while Basis Auth issues the access token used to call BISZ Portal application APIs.

## Configuration

Register a confidential client in `basis-auth` with this callback URL:

```text
http://localhost:4005/api/auth/callback/basis-auth
```

Copy `.env.example` to `.env.local` and provide the registered client ID and secret. Set `BASIS_PORTAL_ORIGIN` to the public portal origin and use a unique `NUXT_SESSION_PASSWORD` of at least 32 random characters. For loopback HTTP origins (`localhost`, `127.0.0.1`, or `::1`), the portal deliberately issues a non-`Secure` development session cookie. All non-loopback environments require HTTPS. Secrets belong only in ignored environment files or the deployment secret store.

The client requests `openid profile email bisz-portal.access` for the `urn:basis:api:bisz-portal` resource. `bisz-portal.access` only indicates that the access token may access BISZ Portal. It does not contain or imply permissions. Do not add permission checks until the permission model is merged and intentionally integrated.

## Application API requirements

Every BISZ Portal application endpoint under `server/api` must:

1. Require the encrypted, HttpOnly Nuxt session cookie unless explicitly public. Do not accept the Basis access token from browser JavaScript or an `Authorization` header.
2. Read the Basis access token retained inside the server-only `secure` session data, then validate its signature, `RS256` algorithm, issuer, `at+jwt` type, `urn:basis:api:bisz-portal` audience, expiration, and `bisz-portal.access` scope.
3. Parse token claims with `accessTokenClaimsSchema` from `@basis/schema/auth`.
4. Return `APIResponse` or `APIError` envelopes from `@basis/schema/api` through `apiResult`.
5. Treat `bisz-portal.access` as access only, never as a permission.

The OIDC handler under `/api/auth/callback/basis-auth` is the sole format exception: its redirects and errors follow the OIDC protocol rather than the application API envelope.

Use `authenticateRequest` and `apiResult` instead of reimplementing these rules:

```ts
import { apiResult } from "~/server/utils/api-response"
import { authenticateRequest } from "~/server/utils/api-auth"
import { APIError, APIResponse } from "~/server/utils/basis-schema"

export default defineEventHandler(async (event) => {
  const authentication = await authenticateRequest(event)
  if (authentication instanceof APIError) return apiResult(event, authentication)

  return apiResult(event, new APIResponse({ userId: authentication.claims.sub }))
})
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
  "error_description": "An authenticated session is required"
}
```

## Reading the signed-in user

The Overview page is the live reference. After the OIDC flow completes, it initializes the user from the validated ID-token claims and retains the short-lived Basis access token inside Nuxt Auth Utils' encrypted, HttpOnly session cookie. The compact ID-token picture URL is used instead of the potentially large UserInfo data URL so the sealed session stays within browser cookie limits. The access token is stored in server-only `secure` session data, which Nuxt Auth Utils omits from its client session endpoint.

The page calls `/api/me` using the same-origin cookie only. `/api/me` decrypts the Nuxt session server-side, retrieves and validates the embedded Basis access token, and returns the OIDC profile fields already retained in that encrypted session.

Client request example:

```ts
const response = await fetch("/api/me")
```

Never expose the access token through component props, Nuxt session JSON, browser storage, logs, or API responses. Never forward the Basis Auth browser cookie or expose the client secret. The current setup does not refresh access tokens; a user signs in again after the Basis access token expires.

For UI-only identity checks in a Nuxt server route, use the Nuxt session:

```ts
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session?.user) return { userId: null }

  return { userId: session.user.id }
})
```

The Nuxt session cookie establishes the local portal session, but the embedded Basis-issued access token remains the authority for BISZ Portal API access. `authenticateRequest` validates both layers before a route continues.
