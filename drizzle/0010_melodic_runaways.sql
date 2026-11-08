-- Migration 0009 updates "projects", which queues the deferred
-- projects_require_owner trigger until commit. Drizzle runs pending
-- migrations in a single transaction, so those pending trigger events
-- block the ALTER TABLE below. Fire them before altering the table.
SET CONSTRAINTS ALL IMMEDIATE;--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_assets_vfs_project_uid_unique";--> statement-breakpoint
ALTER TABLE "projects" DROP CONSTRAINT "projects_assets_manifest_object_id_unique";--> statement-breakpoint
UPDATE "projects" AS target
SET "assets_project_uid" = target."assets_vfs_project_uid"
WHERE target."assets_project_uid" IS NULL
  AND target."assets_vfs_project_uid" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "projects" AS other
    WHERE other."assets_project_uid" = target."assets_vfs_project_uid"
  );--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "assets_vfs_project_uid";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "assets_manifest_object_id";