ALTER TABLE "projects" ADD COLUMN "assets_project_uid" text;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_assets_project_uid_unique" UNIQUE("assets_project_uid");