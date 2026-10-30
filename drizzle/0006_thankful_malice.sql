CREATE TYPE "public"."tag_color" AS ENUM('blue', 'green', 'amber', 'red', 'gray', 'purple');--> statement-breakpoint
CREATE TABLE "tags" (
	"name" text PRIMARY KEY NOT NULL,
	"color" "tag_color" NOT NULL,
	"creator_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tags_name_format_check" CHECK (char_length("tags"."name") between 1 and 64 and "tags"."name" !~ '\s' and "tags"."name" = lower("tags"."name"))
);
