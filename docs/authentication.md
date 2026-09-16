# Basis authentication and API contracts

`bisz-portal` signs users in through the sibling `basis-auth` service (user-facing name: DevConnect) using OpenID Connect. Auth.js manages the browser session, while Basis Auth issues the access token used to call BISZ Portal application APIs.

## Configuration

Register a confidential client in `basis-auth` with this callback URL:

```text
http://localhost:4005/api/auth/callback/basis-auth
```

Copy `.env.example` to `.env.local` and provide the registered client ID and secret. Use a unique `AUTH_SECRET` and HTTPS issuer/callback URLs outside local development. Secrets belong only in ignored environment files or the deployment secret store.

The client requests `openid profile email bisz-portal.access` for the `urn:basis:api:bisz-portal` resource. `bisz-portal.access` only indicates that the access token may access BISZ Portal. It does not contain or imply permissions. Do not add permission checks until the permission model is merged and intentionally integrated.

## Application API requirements

Every BISZ Portal application endpoint under `app/api` must:

1. Require the encrypted, HttpOnly Auth.js session cookie unless explicitly public. Do not accept the Basis access token from browser JavaScript or an `Authorization` header.
2. Read the Basis access token retained inside the server-readable Auth.js JWT session, then validate its signature, `RS256` algorithm, issuer, `at+jwt` type, `urn:basis:api:bisz-portal` audience, expiration, and `bisz-portal.access` scope.
3. Parse token claims with `accessTokenClaimsSchema` from `@basis/schema/auth`.
4. Return `APIResponse` or `APIError` envelopes from `@basis/schema/api` through `apiResult`.
5. Treat `bisz-portal.access` as access only, never as a permission.

The OAuth/Auth.js protocol handlers under `/api/auth/*` are the sole format exception: their responses must follow the OAuth and Auth.js protocols rather than the application API envelope.

Use `authenticateRequest` and `apiResult` instead of reimplementing these rules:

```ts
import { apiResult } from "@/lib/api-response"
import { authenticateRequest } from "@/lib/api-auth"
import { APIError, APIResponse } from "@/lib/basis-schema"

export async function GET(request: Request) {
  const authentication = await authenticateRequest(request)
  if (authentication instanceof APIError) return apiResult(authentication)

  return apiResult(new APIResponse({ userId: authentication.claims.sub }))
}
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

The Overview page is the live reference. After Auth.js completes the OIDC flow, it retains the short-lived Basis access token inside its encrypted, HttpOnly JWT session cookie. The `session` callback deliberately does not copy that token into the client-visible Auth.js session object.

The page calls `/api/me` using the same-origin cookie only. `/api/me` decrypts the Auth.js session server-side, retrieves and validates the embedded Basis access token, and returns the OIDC profile fields already retained in that encrypted session.

Client request example:

```ts
const response = await fetch("/api/me")
```

Never expose the access token through component props, Auth.js session JSON, browser storage, logs, or API responses. Never forward the Basis Auth browser cookie or expose the client secret. The current setup does not refresh access tokens; the Auth.js session is therefore limited to nine minutes, slightly shorter than the current ten-minute access-token lifetime. A user signs in again after expiration.

For UI-only identity checks in a Server Component, the Auth.js session remains available:

```tsx
import { auth } from "@/auth"

export default async function ExamplePage() {
  const session = await auth()
  if (!session?.user) return <p>Not signed in</p>

  return <p>{session.user.id}</p>
}
```

The Auth.js cookie establishes the local portal session, but the embedded Basis-issued access token remains the authority for BISZ Portal API access. `authenticateRequest` validates both layers before a route continues.
