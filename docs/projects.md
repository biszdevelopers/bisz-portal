# Projects foundation

The portal stores product data in its own PostgreSQL database. `DATABASE_URL` must not point to the Basis Auth database.

## Setup

1. Create an empty PostgreSQL database and set `DATABASE_URL`.
2. Set `PORTAL_SEED_OWNER_ID` to a real Basis user UUID.
3. Run `bun run db:setup`. Migrations are append-only and the seed is idempotent.
4. Set `BASIS_AUTH_INTERNAL_URL` and `BASIS_AUTH_INTERNAL_TOKEN` so project member UUIDs can be validated by Basis Auth.

The portal expects Basis access tokens to contain the relevant `BiszPortal.*` permissions. Project membership permissions are stored separately in `project_members`; both the Basis capability and the project capability must allow an action.

Creating a portal project also allocates an Assets project with the signed-in
user's stored Assets token. The user must have `Assets.Projects.create` and
`Assets.Assets.create`. After creating the Assets project, the portal uses
`@basis/assets-vfs` to upload an empty root-directory manifest. Both the Assets
project UID and the returned manifest object ID are stored on the portal
project. If VFS allocation or portal persistence fails, the portal attempts to
delete the newly created Assets project.

The Assets storage section in project settings displays and verifies this link.
Editors can repair a link only when it is absent or the Assets registry confirms
that its project is missing. Portal project edits do not synchronize names or
descriptions after allocation; files and Assets metadata are managed through the
Assets page or Assets API.

The project detail Files tab mounts the stored root manifest through
`@basis/assets-vfs` and provides read-only directory navigation. Directory
contents are fetched through a project-authorized Nitro endpoint; file rows are
shown for context but are not opened or downloaded yet.

## Commands

- `bun run db:generate` generates the next migration from the Drizzle schema.
- `bun run db:migrate` applies pending migrations.
- `bun run db:seed` creates or updates the example project and its linked tasks.
- `bun test` runs authorization and input validation tests.
