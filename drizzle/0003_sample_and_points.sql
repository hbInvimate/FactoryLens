-- Sample-data flag and missed points. Additive and safe to run twice: new nullable columns only.
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "is_sample" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "step_events" ADD COLUMN IF NOT EXISTS "points" jsonb;
