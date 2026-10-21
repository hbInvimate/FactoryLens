-- Tasks: one first-off check to do, shown on the Quality Technician's /tasks page. Additive and safe to run
-- twice: one new table and its indexes. Older code never reads it.
CREATE TABLE IF NOT EXISTS "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"part" text NOT NULL,
	"station" text NOT NULL,
	"priority" text NOT NULL,
	"assigned_to" text NOT NULL,
	"assigned_name" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "tasks_assigned_idx" ON "tasks" USING btree ("assigned_to","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tasks_session_idx" ON "tasks" USING btree ("session_id");
