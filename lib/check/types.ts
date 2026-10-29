import type { IssueEffect, IssueKind } from "@/lib/issues";
import type { HandoffItem, TrialOutcome } from "@/lib/procedure";

/**
 * Live: running, paused, on_hold. Final: complete, scrapped, rework, concession, left.
 * "stopped" and "part_held" are kept only for sessions saved before hold decisions existed.
 */
export type SessionStatus =
  | "running" | "paused" | "on_hold" | "complete" | "scrapped" | "rework" | "concession" | "left"
  | "stopped" | "part_held";

export const STATUS_LABEL: Record<SessionStatus, string> = {
  running: "Running",
  paused: "Paused",
  on_hold: "On hold",
  complete: "Complete",
  scrapped: "Part scrapped",
  rework: "Sent for rework or sorting",
  concession: "Concession approved",
  left: "Left",
  stopped: "On hold",
  part_held: "Part held, not checked",
};

/** Sessions that are over: nothing more happens in them, and they are never "in progress". */
export const ENDED_STATUSES: SessionStatus[] = ["complete", "scrapped", "rework", "concession", "left", "part_held"];

/** Ended without a completed check: never scored. */
export const ENDED_WITHOUT_CHECK: SessionStatus[] = ["scrapped", "rework", "concession", "part_held"];

export const ON_HOLD_STATUSES: SessionStatus[] = ["on_hold", "stopped"];

/** What the people called decided about a hold. The Quality Technician only records it. */
export type HoldOutcome = "cleared" | "scrapped" | "rework" | "concession" | "abandoned";
export const HOLD_OUTCOMES: { id: HoldOutcome; label: string }[] = [
  { id: "cleared", label: "Cleared, the check continues" },
  { id: "scrapped", label: "Part scrapped" },
  { id: "rework", label: "Sent for rework or sorting" },
  { id: "concession", label: "Concession approved" },
  { id: "abandoned", label: "Check abandoned" },
];
export const DECIDERS = ["Process engineer", "Shift supervisor", "Quality"] as const;
export type Decider = (typeof DECIDERS)[number];

export interface HoldDecision {
  outcome: HoldOutcome;
  by: string;
  reason: string;
  /** When the decision was made, as entered. */
  decidedAt: number;
  /** When it was recorded. */
  recordedAt: number;
}

export interface SessionMeta {
  id: string;
  part: string;
  sop: string;
  fixture: string;
  /** The station picked on the start form. Older sessions have none; their fixture text is their station. */
  station?: string;
  operator: string;
  createdAt: number;
  /** The SOP revision the check started on (sop_revisions.id). Older sessions have none: revision A. */
  sopRevisionId?: string;
}

/**
 * Everything the Quality Technician does is one action in an append-only log.
 * State is always rebuilt from the log (see reducer.ts), on the client and on the server.
 * A future video model raises deviations through the same step state (see lib/integrations.ts).
 */
export type ActionBody =
  | { type: "tap_point"; step: number; point: string }
  | { type: "next_step"; step: number }
  /**
   * Back to an earlier step (tap a done step, or Back). That step and the ones after it stay recorded but must be
   * confirmed again, in order. Not a deviation. by: who did it (the audit trail is the action log itself).
   */
  | { type: "go_back"; from: number; to: number; by: string }
  | { type: "release_clamps"; step: number }
  | { type: "fix_continue"; deviation: string }
  | { type: "call_trainer"; deviation: string }
  | { type: "undo"; target: string }
  /**
   * auto: the page was closed or reloaded while the check ran; reopening it resumes on its own.
   * idle: no activity for IDLE_PAUSE_MINUTES; it waits for Resume. Dated at her last action.
   */
  | { type: "pause"; auto?: boolean; idle?: boolean }
  | { type: "resume" }
  /** end: she left this session for good to start a new one. Otherwise leaving pauses it. */
  | { type: "leave"; reason: string; end?: boolean }
  | { type: "fixed_on_spot"; did: string; step: number; issue: string; done: string[] }
  | { type: "lodge"; did: string; step: number; issue: string; tried: string[] }
  | { type: "call_marked"; did: string; who: string }
  | { type: "todo_tick"; did: string; index: number }
  | { type: "handoff"; did: string; item: HandoffItem }
  /** Older sessions only: a stop cleared or scrapped ended the session as "part held". */
  | { type: "clear"; did: string; who: string; outcome: ClearOutcome; reason: string }
  | { type: "hold_decision"; did: string; outcome: HoldOutcome; by: string; reason: string; decidedAt: number }
  | { type: "proc_tick"; did: string; key: string }
  | { type: "proc_holes"; did: string; holes: string[] }
  | { type: "proc_parts"; did: string; count: number }
  | { type: "trial_outcome"; did: string; outcome: TrialOutcome }
  | { type: "proc_close"; did: string }
  /**
   * A value the Quality Technician spoke or typed for a check point (steps 7 to 10). Recorded, never judged:
   * no tolerance, no pass or fail. A recorded value also confirms the point. A correction is a new action.
   * Audio is never kept: only the text heard and the number parsed from it.
   */
  | { type: "measure"; step: number; point: string; value: number | null; unit: string; source: MeasureSource; heard: string; confidence: number | null; status: MeasureStatus };

/** demo: invented by "Fill demo values" (lib/config.ts DEMO_FILL_ENABLED); never a measurement. */
export type MeasureSource = "voice" | "typed" | "demo";
export type MeasureStatus = "recorded" | "missing" | "unclear";

export type ActionType = ActionBody["type"];
export type Action = ActionBody & { id: string; seq: number; at: number };

export const ACTION_TYPES: ActionType[] = [
  "tap_point", "next_step", "go_back", "release_clamps", "fix_continue", "call_trainer", "undo", "pause", "resume",
  "leave", "fixed_on_spot", "lodge", "call_marked", "todo_tick", "handoff", "clear", "hold_decision", "proc_tick",
  "proc_holes", "proc_parts", "trial_outcome", "proc_close", "measure",
];

export type ClearOutcome = "cleared" | "scrapped";

export interface PointMark {
  id: string;
  point: string;
  at: number;
  order: number;
}

export type StepOutcome = "pending" | "correct" | "corrected";

export interface StepRun {
  n: number;
  confirmed: PointMark[];
  /** Clamps tapped out of order, shown red until released. */
  wrong: string[];
  needsRelease: boolean;
  startedAt: number | null;
  doneAt: number | null;
  outcome: StepOutcome;
  /** Done, then reopened by a go-back: recorded, but to be confirmed again before moving on. */
  reconfirm: boolean;
}

export type DeviationKind = "wrong_order" | "skipped";

export interface Deviation {
  id: string;
  step: number;
  kind: DeviationKind;
  /** Skipped: the points not confirmed when she moved on. */
  missing: string[];
  /** Wrong order: the clamp tapped, and the one that should have been. */
  tapped?: string;
  expected?: string;
  /** Failed attempts on this step. The original mistake is attempt 1. */
  failed: number;
  raisedAt: number;
  fixedAt: number | null;
  trainerCalledAt: number | null;
}

export type DiscrepancyStatus =
  | "fixed_on_spot" | "open" | "escalated" | "released"
  | "cleared" | "scrapped" | "rework" | "concession" | "abandoned";

export interface Handoff {
  marks: boolean;
  photos: number;
  sheet: boolean;
  handedOverAt: number | null;
}

export interface ProcState {
  ticks: Record<string, boolean>;
  holes: string[];
  parts: number;
  trials: { outcome: TrialOutcome; at: number }[];
  trialStartedAt: number | null;
  passedAt: number | null;
}

export interface Discrepancy {
  id: string;
  step: number;
  issue: string;
  /** The issue's category, stored with the discrepancy. */
  category: string;
  kind: IssueKind;
  effect: IssueEffect;
  who: string[];
  note: string;
  status: DiscrepancyStatus;
  loggedAt: number;
  /** Fix steps done before it was fixed or lodged. */
  done: string[];
  called: string[];
  todo: boolean[];
  handoff: Handoff;
  clearedBy: string | null;
  clearReason: string | null;
  /** The decision recorded on the hold screen. Null for older sessions (see clearedBy). */
  decision: HoldDecision | null;
  closedAt: number | null;
  /** Present when this issue follows the hole check procedure. */
  proc: ProcState | null;
}

export type StepEventKind = "done" | "wrong_order" | "skipped" | "fixed" | "cannot_do";

export interface StepEvent {
  id: string;
  step: number;
  kind: StepEventKind;
  attempt: number;
  detail: string;
  /** Feature IDs: the missed points of a skipped step, or [tapped, expected] for a wrong order. */
  points: string[];
  at: number;
}

export interface CheckState {
  startedAt: number;
  endedAt: number | null;
  /** 1 to 12; 13 once step 12 is done. */
  current: number;
  steps: StepRun[];
  deviations: Deviation[];
  discrepancies: Discrepancy[];
  paused: boolean;
  pauses: { from: number; to: number | null }[];
  leaves: { at: number; reason: string }[];
  /** Set when she left the session for good. */
  left: { at: number; reason: string } | null;
  /** Set when a hold decision ended the session (scrapped, rework, concession, abandoned). */
  final: { outcome: Exclude<HoldOutcome, "cleared">; at: number; did: string } | null;
  stepEvents: StepEvent[];
  /** When she did something on the check (every action but the automatic pauses), oldest first. For active time. */
  activity: number[];
  /** Every go-back, oldest first. Not deviations. */
  goBacks: { at: number; from: number; to: number; by: string }[];
  status: SessionStatus;
  /** Actions that raised a deviation. They cannot be undone. */
  raisers: Set<string>;
  lastAt: number;
}
