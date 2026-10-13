-- Stations. Safe to run twice: every statement checks before it changes anything.
CREATE TABLE IF NOT EXISTS "stations" (
	"name" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "station" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "active_seconds" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_station_idx" ON "sessions" USING btree ("station","started_at");--> statement-breakpoint
INSERT INTO "stations" ("name") VALUES ('Laser cell 3 · FX-014') ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
-- Existing sessions keep their "Cell and fixture" text; it also becomes their station.
UPDATE "sessions" SET "station" = btrim("fixture") WHERE "station" IS NULL;
