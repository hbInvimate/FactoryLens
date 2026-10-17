-- Spoken or typed values at steps 7 to 10. Additive and safe to run twice: one new table and its indexes.
-- Older code never reads it.
CREATE TABLE IF NOT EXISTS "measurements" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"step" integer NOT NULL,
	"point_id" text NOT NULL,
	"value" double precision,
	"unit" text NOT NULL,
	"source" text NOT NULL,
	"text_heard" text DEFAULT '' NOT NULL,
	"confidence" real,
	"status" text NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "measurements_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "measurements_session_idx" ON "measurements" USING btree ("session_id","step");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "measurements_recorded_idx" ON "measurements" USING btree ("recorded_at");
