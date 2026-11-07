CREATE TABLE "task_tags" (
	"task_id" uuid NOT NULL,
	"tag_name" text NOT NULL,
	CONSTRAINT "task_tags_task_id_tag_name_pk" PRIMARY KEY("task_id","tag_name")
);
--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tags" ADD CONSTRAINT "task_tags_tag_name_tags_name_fk" FOREIGN KEY ("tag_name") REFERENCES "public"."tags"("name") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_tags_tag_name_idx" ON "task_tags" USING btree ("tag_name");