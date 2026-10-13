CREATE TABLE "discrepancies" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"step" integer NOT NULL,
	"issue_label" text NOT NULL,
	"kind" text NOT NULL,
	"who_to_call" jsonb NOT NULL,
	"effect" text NOT NULL,
	"status" text NOT NULL,
	"logged_at" timestamp with time zone NOT NULL,
	"what_was_done" text DEFAULT '' NOT NULL,
	"cleared_by" text,
	"clear_reason" text,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "handoff_items" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"discrepancy_id" text NOT NULL,
	"marks" boolean DEFAULT false NOT NULL,
	"photos" integer DEFAULT 0 NOT NULL,
	"sheet" boolean DEFAULT false NOT NULL,
	"handed_over_at" timestamp with time zone,
	"waiting_seconds" integer DEFAULT 0 NOT NULL,
	"outcome" text,
	"cleared_by" text,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "point_confirmations" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"step" integer NOT NULL,
	"point_id" text NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	"sequence" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"seq" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"status" text NOT NULL,
	"part" text NOT NULL,
	"sop" text NOT NULL,
	"fixture" text NOT NULL,
	"operator_label" text NOT NULL,
	"conformance" integer,
	"correct_first_time" integer DEFAULT 0 NOT NULL,
	"current_step" integer DEFAULT 1 NOT NULL,
	"steps_done" integer DEFAULT 0 NOT NULL,
	"check_points" integer DEFAULT 0 NOT NULL,
	"deviations" integer DEFAULT 0 NOT NULL,
	"discrepancies" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "step_events" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"step" integer NOT NULL,
	"kind" text NOT NULL,
	"attempt" integer NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "discrepancies" ADD CONSTRAINT "discrepancies_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoff_items" ADD CONSTRAINT "handoff_items_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoff_items" ADD CONSTRAINT "handoff_items_discrepancy_id_discrepancies_id_fk" FOREIGN KEY ("discrepancy_id") REFERENCES "public"."discrepancies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_confirmations" ADD CONSTRAINT "point_confirmations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_actions" ADD CONSTRAINT "session_actions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_events" ADD CONSTRAINT "step_events_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discrepancies_session_idx" ON "discrepancies" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "handoff_items_session_idx" ON "handoff_items" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "point_confirmations_session_idx" ON "point_confirmations" USING btree ("session_id","step");--> statement-breakpoint
CREATE INDEX "session_actions_session_idx" ON "session_actions" USING btree ("session_id","seq");--> statement-breakpoint
CREATE INDEX "sessions_started_idx" ON "sessions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "step_events_session_idx" ON "step_events" USING btree ("session_id","at");