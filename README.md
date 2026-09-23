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

## Validation

```bash
bun run typecheck
bun run build
```
