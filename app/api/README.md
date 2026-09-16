# BISZ Portal application APIs

Application routes in this directory must authenticate the encrypted, HttpOnly Auth.js session cookie and validate the Basis access token retained inside that server-readable session. Browser code must not receive or send the access token in an `Authorization` header. Import the shared `@basis/schema` contracts through `lib/basis-schema.ts`, reuse `authenticateRequest` from `lib/api-auth.ts`, and return `APIResponse` or `APIError` through `apiResult` from `lib/api-response.ts`.

`auth/[...nextauth]` is a protocol endpoint and is exempt from the application envelope because OAuth and Auth.js define its response formats.
