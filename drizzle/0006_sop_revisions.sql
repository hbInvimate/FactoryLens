-- SOP management (docs/sop-management). Additive and safe to run twice: new tables, one new nullable
-- column on sessions, new indexes, and the revision A seed with ON CONFLICT DO NOTHING.
-- Older code never reads these, so the live app keeps working before and after.
CREATE TABLE IF NOT EXISTS "sop_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"status" text NOT NULL,
	"scope" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"activated_by" text,
	"activated_at" timestamp with time zone,
	"effective_from" timestamp with time zone,
	"approved_by" text,
	"approved_at" timestamp with time zone,
	"change_reason" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sop_step_revisions" (
	"revision_id" text NOT NULL,
	"step" integer NOT NULL,
	"todo" text NOT NULL,
	"correct" text NOT NULL,
	"mistake" text NOT NULL,
	"rule" text NOT NULL,
	"spoken" text NOT NULL,
	"reference_note" text,
	"target_ct_seconds" integer,
	CONSTRAINT "sop_step_revisions_revision_id_step_pk" PRIMARY KEY("revision_id","step"),
	CONSTRAINT "sop_step_revisions_revision_id_sop_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."sop_revisions"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sop_change_records" (
	"id" text PRIMARY KEY NOT NULL,
	"revision_id" text NOT NULL,
	"step" integer NOT NULL,
	"previous_ct_seconds" integer,
	"new_ct_seconds" integer,
	"reason" text NOT NULL,
	"decided_by" text NOT NULL,
	"decided_at" timestamp with time zone NOT NULL,
	"evidence_session_ids" jsonb NOT NULL,
	"evidence_override_reason" text,
	CONSTRAINT "sop_change_records_revision_id_sop_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."sop_revisions"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sop_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text,
	"actor_name" text NOT NULL,
	"action" text NOT NULL,
	"revision_id" text,
	"step" integer,
	"reason" text,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sop_acknowledgements" (
	"user_id" text NOT NULL,
	"revision_id" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sop_acknowledgements_user_id_revision_id_pk" PRIMARY KEY("user_id","revision_id"),
	CONSTRAINT "sop_acknowledgements_revision_id_sop_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."sop_revisions"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "sop_revision_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_sop_revision_idx" ON "sessions" USING btree ("sop_revision_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sop_audit_revision_idx" ON "sop_audit" USING btree ("revision_id","at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sop_change_records_revision_idx" ON "sop_change_records" USING btree ("revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sop_revisions_scope_label_idx" ON "sop_revisions" USING btree ("scope","label");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sop_revisions_one_active_idx" ON "sop_revisions" USING btree ("scope") WHERE status = 'active';--> statement-breakpoint
-- Revision A, generated from lib/sop.ts (e2e/sop-revisions.spec.ts checks it matches word for word).
INSERT INTO "sop_revisions" ("id", "label", "status", "scope", "created_by", "activated_by", "activated_at", "effective_from", "change_reason") VALUES ('sop-rev-A', 'A', 'active', 'First-off check, B-pillar outer', 'system', 'system', now(), now(), 'Baseline: the SOP in lib/sop.ts, copied once') ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "sop_step_revisions" ("revision_id", "step", "todo", "correct", "mistake", "rule", "spoken", "reference_note", "target_ct_seconds") VALUES
  ('sop-rev-A', 1, 'Put on cut-resistant gloves and safety glasses before touching the part.', 'Gloves and glasses worn before the part is touched.', 'Starting without them.', 'Trimmed hot stamped edges are sharp.', 'Step 1 — Put on gloves and glasses.', NULL, NULL),
  ('sop-rev-A', 2, 'Wipe the pads and pins. No swarf, dross or coating dust.', 'Pads and pins wiped and clear.', 'Loading the part on a dirty fixture.', 'Dirt on pads or pins causes false readings.', 'Step 2 — Clean the pads and pins.', NULL, NULL),
  ('sop-rev-A', 3, 'Lower the part onto pads P1, P2 and P3 first.', 'The part rests on all three pads before it touches the pins.', 'Engaging the pins before the pads.', '', 'Step 3 — Lower the part onto the pads.', NULL, NULL),
  ('sop-rev-A', 4, 'Slide the part until the round pin enters RPS-1, then the slot pin enters RPS-2.', 'Pins enter in that order with no force.', 'Slot pin first, or pushing the part into place.', 'Never force the part. Forcing bends it and creates false deviations.', 'Step 4 — Round pin first. No force.', NULL, NULL),
  ('sop-rev-A', 5, 'Close clamps C1 to C6 lightly, one at a time.', 'Clamps close in order, one at a time. The part already sits on the pads and pins.', 'Wrong order, or two clamps at once.', 'Never use a clamp to pull the part into place. Release and reseat it.', 'Step 5 — Close clamps in order, C1 to C6.', NULL, NULL),
  ('sop-rev-A', 6, 'Close the clamps fully, in the same order, C1 to C6.', 'Clamps close in order, one at a time.', 'Wrong order, or a clamp pulling the part down.', 'Never use a clamp to pull the part into place.', 'Step 6 — Close clamps fully, same order.', NULL, NULL),
  ('sop-rev-A', 7, 'Try a check pin at every hole, H1 to H14, in order. Enter each reading on the tablet.', 'A check pin tried at every hole, in order.', 'A hole is skipped.', 'Readings are entered on the tablet, not here.', 'Step 7 — Check the holes, H1 to H14.', NULL, NULL),
  ('sop-rev-A', 8, 'Check slots S1 to S4 and notches N1 to N4 with the gauge or pin.', 'A gauge or pin applied at each feature.', 'A feature is skipped.', 'Readings are entered on the tablet, not here.', 'Step 8 — Check slots and notches.', NULL, NULL),
  ('sop-rev-A', 9, 'Place the flush pin or contour gauge at every point, T1 to T14.', 'A gauge at every point along each edge.', 'A point is skipped.', 'Readings are entered on the tablet, not here.', 'Step 9 — Check trim edges T1 to T14.', NULL, NULL),
  ('sop-rev-A', 10, 'Use the taper gauge at each of the four flange points, F1 to F4.', 'A gauge at each of the four points.', 'A point is skipped.', 'Readings are entered on the tablet, not here.', 'Step 10 — Check flange gaps F1 to F4.', NULL, NULL),
  ('sop-rev-A', 11, 'Look over the whole part: trim edges, surface and marking (V1 to V5).', 'The whole trim, surface and marking looked over.', 'A quick glance, one side only.', '', 'Step 11 — Look over the whole part.', NULL, NULL),
  ('sop-rev-A', 12, 'Release the clamps in reverse order, C6 down to C1. Remove, rack and tag the part.', 'C6 down to C1, then the part racked and tagged.', 'Wrong order, or the part left untagged.', '', 'Step 12 — Release clamps, C6 to C1.', NULL, NULL)
ON CONFLICT ("revision_id", "step") DO NOTHING;--> statement-breakpoint
INSERT INTO "sop_audit" ("id", "actor_name", "action", "revision_id", "reason") VALUES ('sop-audit-rev-A-seed', 'system', 'seed_baseline', 'sop-rev-A', 'Revision A copied from lib/sop.ts') ON CONFLICT ("id") DO NOTHING;
