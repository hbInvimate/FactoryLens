import { sql } from "drizzle-orm";
import { boolean, doublePrecision, index, integer, jsonb, pgTable, primaryKey, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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
    /** Duration for lists: the check time when complete, else active time to leaving or the last action. Null before any. */
    durationSeconds: integer("duration_seconds"),
    /** Fake sessions from `npm run db:seed-sample`. Removed by `npm run db:clear-sample`. */
    isSample: boolean("is_sample").default(false),
    /** The signed-in person who started it (users.id). Null for sessions from before sign-in and for sample data. */
    userId: text("user_id"),
    /** The SOP revision the check ran on (sop_revisions.id). Null for older sessions: they count as revision A. */
    sopRevisionId: text("sop_revision_id"),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [
    index("sessions_started_idx").on(t.startedAt),
    index("sessions_station_idx").on(t.station, t.startedAt),
    index("sessions_user_idx").on(t.userId, t.startedAt),
    index("sessions_sop_revision_idx").on(t.sopRevisionId),
  ],
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
    /** Feature IDs: missed points of a skipped step, or [tapped, expected] for a wrong order. */
    points: jsonb("points").$type<string[]>(),
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

// ---------- Sign-in (Better Auth). New tables only; "sessions" above stays the first-off check. ----------

/**
 * People who can sign in. Created with `npm run user:create`; there is no public sign-up.
 * role: technician (Quality Technician), engineer (Quality Engineer, the dashboard) or admin.
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: text("role").notNull().default("technician"),
  /** `npm run user:disable`: cannot sign in, and their sessions are ended. */
  disabled: boolean("disabled").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Signed-in browsers. Length depends on the role (lib/auth/roles.ts). */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("auth_sessions_user_idx").on(t.userId)],
);

/** The password hash (argon2id) lives here, provider "credential". */
export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("auth_accounts_user_idx").on(t.userId)],
);

/** Required by Better Auth. Unused while there are no emailed links. */
export const authVerifications = pgTable("auth_verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Failed sign-ins, for the limit of 5 per 15 minutes per account and address. The address is stored hashed. */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    addressHash: text("address_hash").notNull(),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("login_attempts_key_idx").on(t.email, t.addressHash, t.at)],
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

// ---------- SOP management (docs/sop-management). New tables only. ----------

/**
 * A numbered version of the SOP: A, B, C. Exactly one is Active per scope. Revision A is copied once
 * from lib/sop.ts (drizzle/0006_sop_revisions.sql) and never edited. Nothing is ever deleted.
 */
export const sopRevisions = pgTable(
  "sop_revisions",
  {
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    /** draft, active or retired. */
    status: text("status").notNull(),
    scope: text("scope").notNull(),
    createdBy: text("created_by"),
    createdAt: ts("created_at").notNull().defaultNow(),
    activatedBy: text("activated_by"),
    activatedAt: ts("activated_at"),
    effectiveFrom: ts("effective_from"),
    approvedBy: text("approved_by"),
    approvedAt: ts("approved_at"),
    changeReason: text("change_reason"),
    /** One-click flow: whose checks the draft was built from (the Quality Technician label) and which sessions. */
    sourceLabel: text("source_label"),
    sourceSessionIds: jsonb("source_session_ids").$type<string[]>(),
    /** Last change to a draft: a `Check again` older than this is stale. */
    updatedAt: ts("updated_at"),
  },
  (t) => [
    uniqueIndex("sop_revisions_scope_label_idx").on(t.scope, t.label),
    uniqueIndex("sop_revisions_one_active_idx").on(t.scope).where(sql`status = 'active'`),
  ],
);

/**
 * The text and target CT of each of the 12 steps in a revision. Only these fields may change; the step
 * names, order and check points stay in lib/sop.ts.
 */
export const sopStepRevisions = pgTable(
  "sop_step_revisions",
  {
    revisionId: text("revision_id").notNull().references(() => sopRevisions.id),
    step: integer("step").notNull(),
    todo: text("todo").notNull(),
    correct: text("correct").notNull(),
    mistake: text("mistake").notNull(),
    rule: text("rule").notNull(),
    spoken: text("spoken").notNull(),
    referenceNote: text("reference_note"),
    /** Target CT for the step in seconds. Null: not set (revision A, "[set by plant]"). */
    targetCtSeconds: integer("target_ct_seconds"),
  },
  (t) => [primaryKey({ columns: [t.revisionId, t.step] })],
);

/** The Quality Engineer's CT decision for a step in a revision, with its evidence. */
export const sopChangeRecords = pgTable(
  "sop_change_records",
  {
    id: text("id").primaryKey(),
    revisionId: text("revision_id").notNull().references(() => sopRevisions.id),
    step: integer("step").notNull(),
    previousCtSeconds: integer("previous_ct_seconds"),
    newCtSeconds: integer("new_ct_seconds"),
    reason: text("reason").notNull(),
    decidedBy: text("decided_by").notNull(),
    decidedAt: ts("decided_at").notNull(),
    evidenceSessionIds: jsonb("evidence_session_ids").$type<string[]>().notNull(),
    evidenceOverrideReason: text("evidence_override_reason"),
  },
  (t) => [index("sop_change_records_revision_idx").on(t.revisionId)],
);

/** Append-only: who did what to which revision, when and why. Never updated or deleted. */
export const sopAudit = pgTable(
  "sop_audit",
  {
    id: text("id").primaryKey(),
    at: ts("at").notNull().defaultNow(),
    actorId: text("actor_id"),
    actorName: text("actor_name").notNull(),
    action: text("action").notNull(),
    revisionId: text("revision_id"),
    step: integer("step"),
    reason: text("reason"),
    detail: jsonb("detail").$type<Record<string, unknown>>(),
  },
  (t) => [index("sop_audit_revision_idx").on(t.revisionId, t.at)],
);

/** A Quality Technician pressed "I have read this" for a revision. */
export const sopAcknowledgements = pgTable(
  "sop_acknowledgements",
  {
    userId: text("user_id").notNull(),
    revisionId: text("revision_id").notNull().references(() => sopRevisions.id),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.revisionId] })],
);

/**
 * One-click flow: a change the app proposes for one step of a draft, from a candidate's checks. Nothing is
 * applied to the draft until the Quality Engineer accepts or edits it. Rejected suggestions change nothing.
 */
export const sopSuggestions = pgTable(
  "sop_suggestions",
  {
    id: text("id").primaryKey(),
    revisionId: text("revision_id").notNull().references(() => sopRevisions.id),
    step: integer("step").notNull(),
    /** time (target CT, seconds as text) or order (the "What to do" text). */
    type: text("type").notNull(),
    oldValue: text("old_value"),
    /** What the app proposed. Never changed. */
    proposedValue: text("proposed_value").notNull(),
    /** What applies if accepted: the proposal, or the Quality Engineer's edit. */
    newValue: text("new_value").notNull(),
    why: text("why").notNull(),
    /** The numbers behind the why. */
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    /** "Check it is realistic", when set. */
    warning: text("warning"),
    sourceSessionIds: jsonb("source_session_ids").$type<string[]>().notNull(),
    /** proposed, accepted, edited or rejected. */
    status: text("status").notNull(),
    decidedBy: text("decided_by"),
    decidedAt: ts("decided_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("sop_suggestions_revision_idx").on(t.revisionId, t.step)],
);

/** "Check again": the draft tested against the other completed real checks. Kept, never overwritten. */
export const sopValidations = pgTable(
  "sop_validations",
  {
    id: text("id").primaryKey(),
    revisionId: text("revision_id").notNull().references(() => sopRevisions.id),
    runAt: ts("run_at").notNull().defaultNow(),
    runBy: text("run_by"),
    settings: jsonb("settings").$type<Record<string, unknown>>().notNull(),
    results: jsonb("results").$type<Record<string, unknown>>().notNull(),
  },
  (t) => [index("sop_validations_revision_idx").on(t.revisionId, t.runAt)],
);

/** Where each step is in a recorded check, so real video can be attached later. Seconds from the check's start. */
export const sopClipRefs = pgTable(
  "sop_clip_refs",
  {
    id: text("id").primaryKey(),
    revisionId: text("revision_id").notNull().references(() => sopRevisions.id),
    sessionId: text("session_id").notNull(),
    step: integer("step").notNull(),
    startSecond: integer("start_second").notNull(),
    endSecond: integer("end_second").notNull(),
  },
  (t) => [index("sop_clip_refs_revision_idx").on(t.revisionId, t.step)],
);

/**
 * Values the Quality Technician spoke or typed for a check point at steps 7 to 10. Recorded, never judged:
 * no tolerance, no pass or fail. "Voice-entered, not a validated record": the tablet stays the validated record.
 * One row per measure action (the id); a correction is a new row and the old one stays. No audio is kept.
 */
export const measurements = pgTable(
  "measurements",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id").notNull().references(() => sessions.id, { onDelete: "cascade" }),
    step: integer("step").notNull(),
    pointId: text("point_id").notNull(),
    value: doublePrecision("value"),
    unit: text("unit").notNull(),
    /** voice or typed. */
    source: text("source").notNull(),
    /** What the speech recognition heard (or what was typed). */
    textHeard: text("text_heard").notNull().default(""),
    confidence: real("confidence"),
    /** recorded, missing or unclear. */
    status: text("status").notNull(),
    recordedAt: ts("recorded_at").notNull(),
  },
  (t) => [index("measurements_session_idx").on(t.sessionId, t.step), index("measurements_recorded_idx").on(t.recordedAt)],
);

/**
 * A task: one first-off check to do, made with "New Task" on /tasks. Its status is never stored: it follows
 * the linked check (none: Not started; running: In progress; finished: Completed; ended without a check: Closed).
 */
export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    part: text("part").notNull(),
    station: text("station").notNull(),
    /** high, medium or low. */
    priority: text("priority").notNull(),
    /** users.id of the Quality Technician who does it. */
    assignedTo: text("assigned_to").notNull(),
    assignedName: text("assigned_name").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    /** The check started from this task (sessions.id). Null until it is opened. */
    sessionId: text("session_id"),
  },
  (t) => [index("tasks_assigned_idx").on(t.assignedTo, t.createdAt), uniqueIndex("tasks_session_idx").on(t.sessionId)],
);
