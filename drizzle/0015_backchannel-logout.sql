CREATE TABLE "portal_revoked_access_tokens" (
	"jti" text PRIMARY KEY NOT NULL,
	"valid_after" timestamp with time zone NOT NULL,
	"retain_until" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portal_user_logouts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"issued_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "portal_revoked_access_tokens_retention_idx" ON "portal_revoked_access_tokens" USING btree ("retain_until");