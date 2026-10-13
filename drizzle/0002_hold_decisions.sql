-- Hold decisions and issue categories. Additive and safe to run twice: new nullable columns only.
ALTER TABLE "discrepancies" ADD COLUMN IF NOT EXISTS "category" text;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD COLUMN IF NOT EXISTS "decision_outcome" text;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD COLUMN IF NOT EXISTS "decided_by" text;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD COLUMN IF NOT EXISTS "decision_reason" text;--> statement-breakpoint
ALTER TABLE "discrepancies" ADD COLUMN IF NOT EXISTS "decided_at" timestamp with time zone;
