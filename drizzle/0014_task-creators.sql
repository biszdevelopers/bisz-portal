ALTER TABLE "tasks" ADD COLUMN "creator_id" uuid;--> statement-breakpoint
UPDATE "tasks"
SET "creator_id" = "projects"."creator_id"
FROM "projects"
WHERE "tasks"."project_id" = "projects"."id";--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "creator_id" SET NOT NULL;
