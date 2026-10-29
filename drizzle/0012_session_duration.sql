-- Duration for lists (Past sessions, supervisor Tasks): active time, filled on every save. Additive; safe to run twice.
-- Older sessions get it from npm run db:backfill.
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "duration_seconds" integer;
