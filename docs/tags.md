# Shared tag catalog

The portal stores shared tags locally and exposes them through `/api/tags`.
Tag names are canonical lowercase identifiers. They are Unicode-normalized,
trimmed, limited to 64 characters, and cannot contain whitespace.

## Basis Auth permissions

The portal permission catalog must contain these grants:

- `BiszPortal.Tags.read`
- `BiszPortal.Tags.create`
- `BiszPortal.Tags.delete`

Add `BiszPortal.Tags.read` to the BISZ Portal application's default permissions
in Basis Auth. Do not add `create` or `delete` to the defaults; those grants are
assigned explicitly to users who manage the catalog. Selecting an existing tag
for another resource does not require either mutation grant.

The source tree declares and enforces these permissions, but the Basis Auth
application catalog and its default-permission assignment are deployment-owned
configuration and must be updated alongside this release.
