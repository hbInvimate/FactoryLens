-- Who started each check. Additive and safe to run twice: one new nullable column and an index.
-- Older sessions keep user_id null and their typed label.
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "user_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "sessions" USING btree ("user_id","started_at");
