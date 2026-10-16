// SOP management on the server: the data behind /dashboard/sop and the CT decision.
// The Quality Engineer decides; this code checks the rules and keeps the record. It never picks a CT,
// never ticks evidence and never activates anything.
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { AnyDb, Conn } from "@/db/client";
import * as t from "@/db/schema";
import { reduce } from "@/lib/check/reducer";
import type { Action } from "@/lib/check/types";
import { MIN_EVIDENCE_SESSIONS, MIN_EVIDENCE_SHIFTS } from "@/lib/config";
import { shiftOf } from "@/lib/shifts";
import { CODE_REVISION, SOP_SCOPE, type RevisionStatus, type SopRevisionText } from "@/lib/sop-revisions";
import type { StatSession } from "@/lib/sop-stats";
import { getRepo } from "./repo";
import { activeRevision } from "./sop";
import { sessionWhere, type DashFilter } from "./sqlparts";

/** Most sessions read for one view. The newest are used. */
export const STATS_LIMIT = 1000;

function fromRow(r: typeof t.sessionActions.$inferSelect): Action {
  return { ...(r.payload as object), id: r.id, seq: r.seq, at: r.at.getTime(), type: r.type } as Action;
}

async function withActions(db: AnyDb, rows: (typeof t.sessions.$inferSelect)[]): Promise<StatSession[]> {
  if (!rows.length) return [];
  const acts = await db.select().from(t.sessionActions).where(inArray(t.sessionActions.sessionId, rows.map((r) => r.id))).orderBy(asc(t.sessionActions.seq));
  const by = new Map<string, Action[]>();
  for (const a of acts) by.set(a.sessionId, [...(by.get(a.sessionId) ?? []), fromRow(a)]);
  return rows.map((r) => ({ id: r.id, startedAt: r.startedAt.getTime(), isSample: r.isSample === true, operator: r.operatorLabel, userId: r.userId ?? null, actions: by.get(r.id) ?? [] }));
}

/** Completed sessions in a dashboard view (station, range, shift, sample switch), newest first. */
export async function completedSessions(f: DashFilter, c?: Conn): Promise<StatSession[]> {
  const { db } = c ?? (await getRepo().conn());
  const rows = await db
    .select()
    .from(t.sessions)
    .where(and(sessionWhere(f), eq(t.sessions.status, "complete")))
    .orderBy(desc(t.sessions.startedAt))
    .limit(STATS_LIMIT);
  return withActions(db, rows);
}

export interface RevisionSummary {
  id: string;
  label: string;
  status: RevisionStatus;
  createdBy: string | null;
  createdAt: string;
  activatedAt: string | null;
  changeReason: string | null;
  /** The latest CT decision per step: "Step 7: new CT 02:40". */
  changes: { step: number; previousCtSeconds: number | null; newCtSeconds: number | null; decidedBy: string; decidedAt: string; reason: string; evidenceSessionIds: string[]; evidenceOverrideReason: string | null }[];
}

/** Every revision of the SOP, newest label first, with its CT decisions. */
export async function revisions(c?: Conn): Promise<RevisionSummary[]> {
  const { db } = c ?? (await getRepo().conn());
  const revs = await db.select().from(t.sopRevisions).where(eq(t.sopRevisions.scope, SOP_SCOPE)).orderBy(desc(t.sopRevisions.createdAt));
  if (!revs.length) return [];
  const recs = await db.select().from(t.sopChangeRecords).where(inArray(t.sopChangeRecords.revisionId, revs.map((r) => r.id))).orderBy(asc(t.sopChangeRecords.decidedAt));
  return revs
    .map((r) => {
      const latest = new Map<number, (typeof recs)[number]>();
      for (const x of recs.filter((x) => x.revisionId === r.id)) latest.set(x.step, x);
      return {
        id: r.id,
        label: r.label,
        status: r.status as RevisionStatus,
        createdBy: r.createdBy,
        createdAt: r.createdAt.toISOString(),
        activatedAt: r.activatedAt?.toISOString() ?? null,
        changeReason: r.changeReason,
        changes: [...latest.values()]
          .sort((a, b) => a.step - b.step)
          .map((x) => ({
            step: x.step, previousCtSeconds: x.previousCtSeconds, newCtSeconds: x.newCtSeconds, decidedBy: x.decidedBy,
            decidedAt: x.decidedAt.toISOString(), reason: x.reason, evidenceSessionIds: x.evidenceSessionIds, evidenceOverrideReason: x.evidenceOverrideReason,
          })),
      };
    })
    .sort((a, b) => b.label.length - a.label.length || b.label.localeCompare(a.label));
}

export interface AuditEntry {
  id: string;
  at: string;
  actorName: string;
  action: string;
  revisionId: string | null;
  step: number | null;
  reason: string | null;
  detail: Record<string, unknown> | null;
}

export async function auditLog(limit = 200, c?: Conn): Promise<AuditEntry[]> {
  const { db } = c ?? (await getRepo().conn());
  const rows = await db.select().from(t.sopAudit).orderBy(desc(t.sopAudit.at)).limit(limit);
  return rows.map((r) => ({ id: r.id, at: r.at.toISOString(), actorName: r.actorName, action: r.action, revisionId: r.revisionId, step: r.step, reason: r.reason, detail: r.detail ?? null }));
}

/** The 12 step targets of a revision, step 1 first. Null where not set. */
export async function revisionTargets(revisionId: string, c?: Conn): Promise<(number | null)[]> {
  const { db } = c ?? (await getRepo().conn());
  const rows = await db.select({ step: t.sopStepRevisions.step, ct: t.sopStepRevisions.targetCtSeconds }).from(t.sopStepRevisions).where(eq(t.sopStepRevisions.revisionId, revisionId));
  return Array.from({ length: 12 }, (_, i) => rows.find((r) => r.step === i + 1)?.ct ?? null);
}

/** The next free label after the highest one: A → B, Z → AA. */
export function nextLabel(labels: string[]): string {
  const toN = (l: string) => [...l].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
  const max = Math.max(0, ...labels.filter((l) => /^[A-Z]+$/.test(l)).map(toN));
  let n = max + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export class SopRuleError extends Error {}

export interface CtDecisionInput {
  step: number;
  newCtSeconds: number;
  reason: string;
  /** "I decided this CT. FactoryLens AI did not." */
  confirmed: boolean;
  evidenceSessionIds: string[];
  /** Needed when the evidence is below the minimum in lib/config.ts. */
  overrideReason?: string;
}

export interface EvidenceCheck {
  sessions: number;
  shifts: number;
  met: boolean;
}

export function evidenceMinimum(shifts: string[]): EvidenceCheck {
  const distinct = new Set(shifts).size;
  return { sessions: shifts.length, shifts: distinct, met: shifts.length >= MIN_EVIDENCE_SESSIONS && distinct >= MIN_EVIDENCE_SHIFTS };
}

/**
 * Records the Quality Engineer's new CT for one step in the open Draft revision (creating Draft B, C...
 * from the Active revision if there is none), with a change record and audit entries.
 * Evidence must be completed, real sessions with the step correct on the first attempt.
 */
export async function saveCtDecision(
  who: { id: string; name: string },
  input: CtDecisionInput,
  c?: Conn,
): Promise<{ revisionId: string; label: string; evidence: EvidenceCheck; created: boolean }> {
  const { db } = c ?? (await getRepo().conn());
  const { step, newCtSeconds } = input;
  if (!Number.isInteger(step) || step < 1 || step > 12) throw new SopRuleError("The step must be 1 to 12.");
  if (!Number.isInteger(newCtSeconds) || newCtSeconds < 1 || newCtSeconds > 3599) throw new SopRuleError("Enter the new CT as mm:ss, from 00:01 to 59:59.");
  const reason = input.reason.trim();
  if (!reason) throw new SopRuleError("Write the reason for the new CT.");
  if (reason.length > 2000) throw new SopRuleError("The reason is too long (2000 characters at most).");
  if (input.confirmed !== true) throw new SopRuleError('Tick "I decided this CT. FactoryLens AI did not."');
  const ids = [...new Set(input.evidenceSessionIds)];
  if (ids.length > 200) throw new SopRuleError("Too many evidence sessions (200 at most).");

  // Every evidence session: real, completed, and this step correct on the first attempt.
  const rows = ids.length ? await db.select().from(t.sessions).where(inArray(t.sessions.id, ids)) : [];
  if (rows.length !== ids.length) throw new SopRuleError("An evidence session was not found.");
  if (rows.some((r) => r.isSample === true)) throw new SopRuleError("Sample sessions cannot be used as evidence.");
  if (rows.some((r) => r.status !== "complete")) throw new SopRuleError("Evidence must be completed sessions.");
  for (const s of await withActions(db, rows)) {
    const st = reduce(s.actions, s.startedAt);
    if (st.steps[step - 1].outcome !== "correct") throw new SopRuleError(`Step ${step} was not correct on the first attempt in one of the evidence sessions.`);
  }
  const evidence = evidenceMinimum(rows.map((r) => shiftOf(r.startedAt)));
  const override = input.overrideReason?.trim() || null;
  if (!evidence.met && !override) {
    throw new SopRuleError(
      `The evidence is below the minimum: ${MIN_EVIDENCE_SESSIONS} sessions from ${MIN_EVIDENCE_SHIFTS} shifts. Tick more sessions, or write why you go ahead with fewer.`,
    );
  }
  if (override && override.length > 2000) throw new SopRuleError("The override reason is too long (2000 characters at most).");

  const active: SopRevisionText = await activeRevision(c);
  const now = new Date();

  // The open Draft, or a new one copied from the Active revision.
  let [draft] = await db.select().from(t.sopRevisions).where(and(eq(t.sopRevisions.scope, SOP_SCOPE), eq(t.sopRevisions.status, "draft"))).orderBy(asc(t.sopRevisions.createdAt)).limit(1);
  let created = false;
  if (!draft) {
    const labels = (await db.select({ label: t.sopRevisions.label }).from(t.sopRevisions).where(eq(t.sopRevisions.scope, SOP_SCOPE))).map((r) => r.label);
    const id = `sop-rev-${randomUUID()}`;
    [draft] = await db
      .insert(t.sopRevisions)
      .values({ id, label: nextLabel(labels.length ? labels : ["A"]), status: "draft", scope: SOP_SCOPE, createdBy: who.name, createdAt: now })
      .returning();
    const base = active.steps.length === 12 ? active : CODE_REVISION;
    await db.insert(t.sopStepRevisions).values(
      base.steps.map((s, i) => ({ revisionId: id, step: i + 1, todo: s.todo, correct: s.correct, mistake: s.mistake, rule: s.rule, spoken: s.spoken, referenceNote: s.referenceNote, targetCtSeconds: s.targetCtSeconds })),
    );
    created = true;
  }

  const previous = active.steps[step - 1]?.targetCtSeconds ?? null;
  await db
    .update(t.sopStepRevisions)
    .set({ targetCtSeconds: newCtSeconds })
    .where(and(eq(t.sopStepRevisions.revisionId, draft.id), eq(t.sopStepRevisions.step, step)));
  await db.insert(t.sopChangeRecords).values({
    id: randomUUID(), revisionId: draft.id, step, previousCtSeconds: previous, newCtSeconds, reason, decidedBy: who.name, decidedAt: now,
    evidenceSessionIds: ids, evidenceOverrideReason: evidence.met ? null : override,
  });

  const audit = (action: string, extra: { reason?: string | null; detail?: Record<string, unknown> }) =>
    ({ id: randomUUID(), at: now, actorId: who.id, actorName: who.name, action, revisionId: draft.id, step, reason: extra.reason ?? null, detail: extra.detail ?? null });
  const entries = [
    ...(created ? [audit("draft_created", { detail: { label: draft.label, copiedFrom: active.id ?? "lib/sop.ts" } })] : []),
    audit("ct_decided", {
      reason,
      detail: { previousCtSeconds: previous, newCtSeconds, evidenceSessionIds: ids, evidenceSessions: evidence.sessions, evidenceShifts: evidence.shifts, minimumMet: evidence.met, confirmedByPerson: true },
    }),
    ...(!evidence.met ? [audit("evidence_override", { reason: override, detail: { evidenceSessions: evidence.sessions, evidenceShifts: evidence.shifts, minimumSessions: MIN_EVIDENCE_SESSIONS, minimumShifts: MIN_EVIDENCE_SHIFTS } })] : []),
  ];
  await db.insert(t.sopAudit).values(entries);
  return { revisionId: draft.id, label: draft.label, evidence, created };
}

/** For the overview: median actual check time of the sessions, in seconds. */
export function medianCheckSeconds(values: (number | null)[]): number | null {
  const v = values.filter((x): x is number => x !== null).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = (v.length - 1) / 2;
  return Math.round((v[Math.floor(mid)] + v[Math.ceil(mid)]) / 2);
}
