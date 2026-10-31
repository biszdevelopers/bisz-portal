ALTER TABLE "projects" ADD COLUMN "assets_vfs_project_uid" text;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_assets_vfs_project_uid_unique" UNIQUE("assets_vfs_project_uid");--> statement-breakpoint
UPDATE "projects"
SET "assets_vfs_project_uid" = "assets_project_uid",
    "assets_project_uid" = NULL
WHERE "assets_manifest_object_id" IS NOT NULL;
