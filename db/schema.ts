import { boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** One first-off check. Summary columns are rebuilt from the action journal on every save. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    startedAt: ts("started_at").notNull(),
    endedAt: ts("ended_at"),
    status: text("status").notNull(),
    part: text("part").notNull(),
    sop: text("sop").notNull(),
    /** "Cell and fixture" as typed when the session started. Kept as is. */
    fixture: text("fixture").notNull(),
    /** The station picked from the list. Older sessions: backfilled from fixture. */
    station: text("station"),
    operatorLabel: text("operator_label").notNull(),
    /** Percent, steps correct first time / 12. Null until complete, and for a held part. */
    conformance: integer("conformance"),
    correctFirstTime: integer("correct_first_time").notNull().default(0),
    currentStep: integer("current_step").notNull().default(1),
    stepsDone: integer("steps_done").notNull().default(0),
    checkPoints: integer("check_points").notNull().default(0),
    deviations: integer("deviations").notNull().default(0),
    discrepancies: integer("discrepancies").notNull().default(0),
    /** Check time: start to step 12 done, without paused time. Null unless complete. */
    activeSeconds: integer("active_seconds"),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [index("sessions_started_idx").on(t.startedAt), index("sessions_station_idx").on(t.station, t.startedAt)],
);

/** Stations: a cell and fixture where first-off checks are run. */
export const stations = pgTable("stations", {
  name: text("name").primaryKey(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Append-only log of what the Quality Technician did. The source of truth. */
export const sessionActions = pgTable(
  "session_actions",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    at: ts("at").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    receivedAt: ts("received_at").notNull().defaultNow(),
  },
  (t) => [index("session_actions_session_idx").on(t.sessionId, t.seq)],
);

/** Step events: done, wrong order, skipped, fixed, cannot do. */
export const stepEvents = pgTable(
  "step_events",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    step: integer("step").notNull(),
    kind: text("kind").notNull(),
    attempt: integer("attempt").notNull(),
    detail: text("detail").notNull().default(""),
    at: ts("at").notNull(),
  },
  (t) => [index("step_events_session_idx").on(t.sessionId, t.at)],
);

/** Feature IDs confirmed by tap. Never a measured value. */
export const pointConfirmations = pgTable(
  "point_confirmations",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    step: integer("step").notNull(),
    pointId: text("point_id").notNull(),
    confirmedAt: ts("confirmed_at").notNull(),
    sequence: integer("sequence").notNull(),
  },
  (t) => [index("point_confirmations_session_idx").on(t.sessionId, t.step)],
);

/** Something wrong with the part, fixture, gauge or setup, lodged by the Quality Technician. */
export const discrepancies = pgTable(
  "discrepancies",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    step: integer("step").notNull(),
    issueLabel: text("issue_label").notNull(),
    kind: text("kind").notNull(),
    whoToCall: jsonb("who_to_call").$type<string[]>().notNull(),
    effect: text("effect").notNull(),
    status: text("status").notNull(),
    loggedAt: ts("logged_at").notNull(),
    whatWasDone: text("what_was_done").notNull().default(""),
    clearedBy: text("cleared_by"),
    clearReason: text("clear_reason"),
    closedAt: ts("closed_at"),
    /** From docs/dashboard/issue_categories.json. */
    category: text("category"),
    /** The hold decision, recorded by the Quality Technician, made by others. Null for older rows. */
    decisionOutcome: text("decision_outcome"),
    decidedBy: text("decided_by"),
    decisionReason: text("decision_reason"),
    decidedAt: ts("decided_at"),
  },
  (t) => [index("discrepancies_session_idx").on(t.sessionId)],
);

/** Marks, photos, handoff sheet, handed over, waiting time and outcome for a lodged discrepancy. */
export const handoffItems = pgTable(
  "handoff_items",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    discrepancyId: text("discrepancy_id").notNull().references(() => discrepancies.id, { onDelete: "cascade" }),
    marks: boolean("marks").notNull().default(false),
    photos: integer("photos").notNull().default(0),
    sheet: boolean("sheet").notNull().default(false),
    handedOverAt: ts("handed_over_at"),
    waitingSeconds: integer("waiting_seconds").notNull().default(0),
    outcome: text("outcome"),
    clearedBy: text("cleared_by"),
    reason: text("reason"),
  },
  (t) => [index("handoff_items_session_idx").on(t.sessionId)],
);
