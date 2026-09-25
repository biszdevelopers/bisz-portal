# Projects foundation

The portal stores product data in its own PostgreSQL database. `DATABASE_URL` must not point to the Basis Auth database.

## Setup

1. Create an empty PostgreSQL database and set `DATABASE_URL`.
2. Set `PORTAL_SEED_OWNER_ID` to a real Basis user UUID.
3. Run `bun run db:setup`. Migrations are append-only and the seed is idempotent.
4. Set `BASIS_AUTH_INTERNAL_URL` and `BASIS_AUTH_INTERNAL_TOKEN` so project member UUIDs can be validated by Basis Auth.

The portal expects Basis access tokens to contain the relevant `BiszPortal.*` permissions. Project membership permissions are stored separately in `project_members`; both the Basis capability and the project capability must allow an action.

## Commands

- `bun run db:generate` generates the next migration from the Drizzle schema.
- `bun run db:migrate` applies pending migrations.
- `bun run db:seed` creates or updates the example project and its linked tasks.
- `bun test` runs authorization and input validation tests.
