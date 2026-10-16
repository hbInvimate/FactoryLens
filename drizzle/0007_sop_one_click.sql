-- SOP one-click flow (docs/sop-management/one-click-flow.md). Additive and safe to run twice: three new
-- tables and three nullable columns on sop_revisions. Older code never reads them.
CREATE TABLE IF NOT EXISTS "sop_suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"revision_id" text NOT NULL,
	"step" integer NOT NULL,
	"type" text NOT NULL,
	"old_value" text,
	"proposed_value" text NOT NULL,
	"new_value" text NOT NULL,
	"why" text NOT NULL,
	"detail" jsonb,
	"warning" text,
	"source_session_ids" jsonb NOT NULL,
	"status" text NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sop_suggestions_revision_id_sop_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."sop_revisions"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sop_validations" (
	"id" text PRIMARY KEY NOT NULL,
	"revision_id" text NOT NULL,
	"run_at" timestamp with time zone DEFAULT now() NOT NULL,
	"run_by" text,
	"settings" jsonb NOT NULL,
	"results" jsonb NOT NULL,
	CONSTRAINT "sop_validations_revision_id_sop_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."sop_revisions"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sop_clip_refs" (
	"id" text PRIMARY KEY NOT NULL,
	"revision_id" text NOT NULL,
	"session_id" text NOT NULL,
	"step" integer NOT NULL,
	"start_second" integer NOT NULL,
	"end_second" integer NOT NULL,
	CONSTRAINT "sop_clip_refs_revision_id_sop_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."sop_revisions"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
ALTER TABLE "sop_revisions" ADD COLUMN IF NOT EXISTS "source_label" text;--> statement-breakpoint
ALTER TABLE "sop_revisions" ADD COLUMN IF NOT EXISTS "source_session_ids" jsonb;--> statement-breakpoint
ALTER TABLE "sop_revisions" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sop_suggestions_revision_idx" ON "sop_suggestions" USING btree ("revision_id","step");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sop_validations_revision_idx" ON "sop_validations" USING btree ("revision_id","run_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sop_clip_refs_revision_idx" ON "sop_clip_refs" USING btree ("revision_id","step");
