# Basis Portal

Basis Portal is a Nuxt 4 and Vue 3 operations workspace using Element Plus.

## Development

Install dependencies and start the portal:

```bash
bun install
bun run dev
```

The local portal runs at `http://localhost:4005`.

## Authentication

The portal signs in through the sibling Basis Auth service (DevConnect) with OpenID Connect. Copy `.env.example` to `.env.local`, configure the registered client credentials, and keep `NUXT_SESSION_PASSWORD` private. The required callback URL is:

```text
http://localhost:4005/api/auth/callback/basis-auth
```

Run `bun run db:migrate` before starting the updated portal. Its
`portal_auth_tokens` table holds encrypted access and rotating refresh tokens
per portal session. The sealed, HttpOnly cookie now holds only an opaque session
reference; existing cookie sessions are migrated on their next authenticated
request. Access tokens refresh shortly before expiry, and signing out removes
the stored token pair. Keep `NUXT_SESSION_PASSWORD` stable because it also
derives the database token-encryption key. A revoked or expired refresh token
requires a new DevConnect sign-in.

## Validation

```bash
bun run typecheck
bun run build
```
