// SOP revisions (docs/sop-management). A revision may change only the text fields and the target CT
// of each step. The 12 steps, their names, order and check points stay in lib/sop.ts.
// No "server-only": the check app (browser) merges revision text onto the steps too.
import { STEPS, type SopStep } from "./sop";

/** The procedure every revision belongs to (sop_revisions.scope). */
export const SOP_SCOPE = "First-off check, B-pillar outer";

/** Revision A: copied once from lib/sop.ts by drizzle/0006_sop_revisions.sql and never edited. */
export const REV_A_ID = "sop-rev-A";
export const REV_A_LABEL = "A";

export type RevisionStatus = "draft" | "active" | "retired";

/** The fields a revision may change for one step. */
export interface StepText {
  todo: string;
  correct: string;
  mistake: string;
  rule: string;
  spoken: string;
  referenceNote: string | null;
  /** Seconds. Null: not set ("[set by plant]"). */
  targetCtSeconds: number | null;
}

export interface SopRevisionText {
  /** sop_revisions.id; null when the database has no revisions and lib/sop.ts is used. */
  id: string | null;
  label: string;
  /** Exactly 12, step 1 first. */
  steps: StepText[];
}

export const EDITABLE_FIELDS = ["todo", "correct", "mistake", "rule", "spoken", "referenceNote", "targetCtSeconds"] as const;

/**
 * Placeholder target CTs of revision A, step 1 first: 45:00 for the whole check. drizzle/0008 writes the same
 * into the database. Placeholders: the suggestions never judge against them, only against the station median.
 */
export const PLACEHOLDER_TARGET_SECONDS = [30, 90, 60, 90, 120, 90, 840, 420, 540, 240, 120, 60];

export function codeStepText(s: SopStep): StepText {
  return { todo: s.todo, correct: s.correct, mistake: s.mistake, rule: s.rule, spoken: s.spoken, referenceNote: null, targetCtSeconds: PLACEHOLDER_TARGET_SECONDS[s.n - 1] ?? null };
}

/** The fallback: revision A exactly as lib/sop.ts has it. */
export const CODE_REVISION: SopRevisionText = { id: null, label: REV_A_LABEL, steps: STEPS.map(codeStepText) };

/** "First-off check, rev A": stored on each session (sessions.sop) and shown on the start page. */
export function sopName(label: string): string {
  return `First-off check, rev ${label}`;
}

/** A step from lib/sop.ts with the revision's text on top. Name, phase and check points stay. */
export function stepOf(rev: SopRevisionText, n: number): SopStep & Pick<StepText, "referenceNote" | "targetCtSeconds"> {
  const base = STEPS[n - 1];
  if (!base) throw new Error(`No step ${n}`);
  const t = rev.steps[n - 1] ?? codeStepText(base);
  return { ...base, todo: t.todo, correct: t.correct, mistake: t.mistake, rule: t.rule, spoken: t.spoken, referenceNote: t.referenceNote, targetCtSeconds: t.targetCtSeconds };
}

/** Check CT target: the sum of the 12 step targets, or null unless every step has one. */
export function checkTargetSeconds(rev: SopRevisionText): number | null {
  if (rev.steps.length !== 12 || rev.steps.some((s) => s.targetCtSeconds === null)) return null;
  return rev.steps.reduce((sum, s) => sum + (s.targetCtSeconds ?? 0), 0);
}
