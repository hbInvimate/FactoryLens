// Making a revision the primary way (activate), making an older one active again (rollback), what changed,
// the Quality Technician's "I have read this", and the optional "Check again". Every action is audited.
// A new revision applies to NEW checks only: a running check keeps the revision it started with.
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { AnyDb } from "@/db/client";
import * as t from "@/db/schema";
import { MIN_EVIDENCE_SESSIONS, REALISTIC_FASTER_THAN_PERCENT } from "@/lib/config";
import { shiftOf } from "@/lib/shifts";
import { checkRows } from "@/lib/sop-candidates";
import { SOP_SCOPE, type SopRevisionText } from "@/lib/sop-revisions";
import { mmss } from "@/lib/sop-stats";
import { getRepo } from "./repo";
import { activeRevision, runnableRevisions } from "./sop";
import { SopRuleError, completedSessions } from "./sopData";

type Who = { id: string; name: string };

async function audit(db: AnyDb, who: Who, action: string, revisionId: string, reason: string | null, detail: Record<string, unknown>) {
  await db.insert(t.sopAudit).values({ id: randomUUID(), at: new Date(), actorId: who.id, actorName: who.name, action, revisionId, reason, detail });
}

export interface StepChange {
  step: number;
  oldCt: number | null;
  newCt: number | null;
  /** The text fields that changed, in plain words. */
  fields: string[];
  newTodo: string | null;
}

const FIELDS: [keyof SopRevisionText["steps"][number], string][] = [
  ["todo", "What to do"], ["correct", "What correct looks like"], ["mistake", "Common mistake"], ["rule", "Safety rule"],
  ["spoken", "Spoken line"], ["referenceNote", "Reference note"],
];

/** What differs between two revisions, step by step. */
export function changesBetween(from: { steps: SopRevisionText["steps"] }, to: { steps: SopRevisionText["steps"] }): StepChange[] {
  const out: StepChange[] = [];
  for (let i = 0; i < 12; i++) {
    const a = from.steps[i];
    const b = to.steps[i];
    if (!a || !b) continue;
    const fields = FIELDS.filter(([k]) => a[k] !== b[k]).map(([, label]) => label);
    const ct = a.targetCtSeconds !== b.targetCtSeconds;
    if (ct || fields.length) out.push({ step: i + 1, oldCt: a.targetCtSeconds, newCt: b.targetCtSeconds, fields, newTodo: a.todo !== b.todo ? b.todo : null });
  }
  return out;
}

export function changeSummary(changes: StepChange[]): string {
  return changes
    .map((c) => {
      const parts = [...(c.oldCt !== c.newCt ? [`target CT ${mmss(c.newCt)}`] : []), ...c.fields];
      return `Step ${c.step} changed: ${parts.join(", ")}.`;
    })
    .join(" ");
}

async function revisionText(db: AnyDb, id: string): Promise<SopRevisionText | null> {
  const [rev] = await db.select().from(t.sopRevisions).where(eq(t.sopRevisions.id, id));
  if (!rev) return null;
  const steps = (await db.select().from(t.sopStepRevisions).where(eq(t.sopStepRevisions.revisionId, id))).sort((a, b) => a.step - b.step);
  return {
    id, label: rev.label,
    steps: steps.map((s) => ({ todo: s.todo, correct: s.correct, mistake: s.mistake, rule: s.rule, spoken: s.spoken, referenceNote: s.referenceNote, targetCtSeconds: s.targetCtSeconds })),
  };
}

/** Every session the revision's decisions rest on: the candidate's checks, the suggestions' and the manual evidence. */
async function evidenceIds(db: AnyDb, revisionId: string, source: string[] | null): Promise<string[]> {
  const [sugs, recs] = await Promise.all([
    db.select({ ids: t.sopSuggestions.sourceSessionIds }).from(t.sopSuggestions).where(and(eq(t.sopSuggestions.revisionId, revisionId), inArray(t.sopSuggestions.status, ["accepted", "edited"]))),
    db.select({ ids: t.sopChangeRecords.evidenceSessionIds }).from(t.sopChangeRecords).where(eq(t.sopChangeRecords.revisionId, revisionId)),
  ]);
  return [...new Set([...(source ?? []), ...sugs.flatMap((s) => s.ids), ...recs.flatMap((r) => r.ids)])];
}

/**
 * Makes a Draft the Active revision ("Make this the primary way"), or an older revision active again
 * (rollback). The previous Active revision is retired, never deleted. Blocked only when any evidence is a
 * sample session. New checks use it from now on; running checks keep their revision.
 */
export async function activate(who: Who, revisionId: string, reasonIn: string, kind: "primary" | "rollback"): Promise<{ label: string; from: string | null }> {
  const conn = await getRepo().conn();
  const { db, batch } = conn;
  const reason = reasonIn.trim();
  if (!reason) throw new SopRuleError("Write the reason.");
  if (reason.length > 2000) throw new SopRuleError("The reason is too long (2000 characters at most).");
  const [rev] = await db.select().from(t.sopRevisions).where(eq(t.sopRevisions.id, revisionId));
  if (!rev) throw new SopRuleError("No such revision.");
  if (kind === "primary" && rev.status !== "draft") throw new SopRuleError("Only a draft revision can be made the primary way.");
  if (kind === "rollback" && rev.status !== "retired") throw new SopRuleError("Only a revision that was active before can be made active again.");

  const ids = await evidenceIds(db, revisionId, rev.sourceSessionIds);
  if (ids.length) {
    const samples = await db.select({ id: t.sessions.id }).from(t.sessions).where(and(inArray(t.sessions.id, ids), eq(t.sessions.isSample, true)));
    if (samples.length) {
      throw new SopRuleError(`This revision cannot be made active: ${samples.length} of its evidence ${samples.length === 1 ? "session is" : "sessions are"} SAMPLE data. Only real checks can support a new SOP.`);
    }
  }

  const [current] = await db.select().from(t.sopRevisions).where(and(eq(t.sopRevisions.scope, SOP_SCOPE), eq(t.sopRevisions.status, "active")));
  const now = new Date();
  // Retire first, then activate: only one Active revision at a time (a unique index makes sure).
  await batch([
    ...(current ? [db.update(t.sopRevisions).set({ status: "retired" }).where(eq(t.sopRevisions.id, current.id))] : []),
    db
      .update(t.sopRevisions)
      .set({ status: "active", activatedBy: who.name, activatedAt: now, effectiveFrom: now, ...(kind === "primary" ? { changeReason: reason } : {}) })
      .where(eq(t.sopRevisions.id, revisionId)),
  ]);
  await audit(db, who, kind === "primary" ? "activated" : "rolled_back", revisionId, reason, {
    label: rev.label, from: current?.id ?? null, fromLabel: current?.label ?? null, evidenceSessions: ids.length, effectiveFrom: now.toISOString(),
  });
  return { label: rev.label, from: current?.label ?? null };
}

/**
 * The one-time banner for a Quality Technician: the Active revision, if a person made it active and this
 * person has not pressed "I have read this" for it yet, with what changed against the revision it replaced.
 */
export async function bannerFor(userId: string): Promise<{ revisionId: string; label: string; summary: string } | null> {
  try {
    const { db } = await getRepo().conn();
    const active = await activeRevision();
    if (!active.id) return null;
    const [rev] = await db.select().from(t.sopRevisions).where(eq(t.sopRevisions.id, active.id));
    if (!rev || !rev.activatedBy || rev.activatedBy === "system") return null;
    const [ack] = await db.select().from(t.sopAcknowledgements).where(and(eq(t.sopAcknowledgements.userId, userId), eq(t.sopAcknowledgements.revisionId, active.id)));
    if (ack) return null;
    const [entry] = await db
      .select()
      .from(t.sopAudit)
      .where(and(eq(t.sopAudit.revisionId, active.id), inArray(t.sopAudit.action, ["activated", "rolled_back"])))
      .orderBy(desc(t.sopAudit.at))
      .limit(1);
    const fromId = (entry?.detail as { from?: string | null } | null)?.from ?? null;
    const from = fromId ? await revisionText(db, fromId) : null;
    const changes = from ? changesBetween(from, active) : [];
    return { revisionId: active.id, label: active.label, summary: changes.length ? changeSummary(changes) : "Read the step details before you start." };
  } catch {
    return null;
  }
}

/** "I have read this". Safe to press twice. */
export async function acknowledge(who: Who, revisionId: string): Promise<void> {
  const { db } = await getRepo().conn();
  const [rev] = await db.select({ id: t.sopRevisions.id }).from(t.sopRevisions).where(eq(t.sopRevisions.id, revisionId));
  if (!rev) throw new SopRuleError("No such revision.");
  const inserted = await db.insert(t.sopAcknowledgements).values({ userId: who.id, revisionId, at: new Date() }).onConflictDoNothing().returning();
  if (inserted.length) await audit(db, who, "acknowledged", revisionId, null, {});
}

/** The changes a Draft would make against the Active revision: what the confirm box lists. */
export async function pendingChanges(revisionId: string): Promise<StepChange[]> {
  const { db } = await getRepo().conn();
  const [draft, active] = await Promise.all([revisionText(db, revisionId), activeRevision()]);
  return draft ? changesBetween(active, draft) : [];
}

export interface CheckAgainResult {
  runAt: string;
  others: number;
  meeting: number;
  technicians: number;
  shifts: number;
  firstTimeCorrect: number | null;
  warnings: string[];
}

/**
 * Optional "Check again": the Draft's new CTs against the OTHER completed real checks at the station in the
 * last 30 days (not the candidate's own). Saved with the draft. It never blocks activation.
 */
export async function checkAgain(who: Who, revisionId: string, station: string): Promise<CheckAgainResult> {
  const conn = await getRepo().conn();
  const { db } = conn;
  const [rev] = await db.select().from(t.sopRevisions).where(eq(t.sopRevisions.id, revisionId));
  if (!rev || rev.status !== "draft") throw new SopRuleError("Only a draft revision can be checked again.");
  const [draft, active] = await Promise.all([revisionText(db, revisionId), activeRevision(conn)]);
  if (!draft) throw new SopRuleError("No such revision.");
  const changed = changesBetween(active, draft).filter((c) => c.newCt !== null && c.newCt !== c.oldCt);
  const own = new Set(rev.sourceSessionIds ?? []);
  const since = new Date(Date.now() - 30 * 86_400_000);
  const rows = checkRows((await completedSessions({ station, since, shift: null, includeSample: false }, conn)).filter((s) => !own.has(s.id)));
  const meets = rows.filter((r) => changed.every((c) => r.stepSeconds[c.step - 1] !== null && (r.stepSeconds[c.step - 1] as number) <= (c.newCt as number)));
  const warnings: string[] = [];
  if (rows.length < MIN_EVIDENCE_SESSIONS) warnings.push(`Only ${rows.length} other checks in the last 30 days (fewer than ${MIN_EVIDENCE_SESSIONS}).`);
  for (const c of changed) {
    const times = rows.map((r) => r.stepSeconds[c.step - 1]).filter((x): x is number => x !== null);
    const slower = times.filter((x) => x > (c.newCt as number)).length;
    if (times.length && (slower / times.length) * 100 >= REALISTIC_FASTER_THAN_PERCENT) warnings.push(`Step ${c.step}: new CT is faster than ${REALISTIC_FASTER_THAN_PERCENT}% of checks.`);
  }
  if (!changed.length) warnings.push("No new CTs in this draft to check.");
  const result: CheckAgainResult = {
    runAt: new Date().toISOString(),
    others: rows.length,
    meeting: meets.length,
    technicians: new Set(meets.map((r) => r.who)).size,
    shifts: new Set(meets.map((r) => shiftOf(r.startedAt))).size,
    firstTimeCorrect: meets.length ? Math.round(meets.reduce((a, r) => a + r.conformance, 0) / meets.length) : null,
    warnings,
  };
  await db.insert(t.sopValidations).values({
    id: randomUUID(), revisionId, runAt: new Date(result.runAt), runBy: who.name,
    settings: { station, days: 30, steps: changed.map((c) => ({ step: c.step, newCt: c.newCt })) }, results: { ...result },
  });
  await audit(db, who, "checked_again", revisionId, null, { ...result });
  return result;
}

/** The latest "Check again" of a draft, and whether the draft changed since (stale). */
export async function latestCheckAgain(revisionId: string): Promise<(CheckAgainResult & { stale: boolean }) | null> {
  const { db } = await getRepo().conn();
  const [v] = await db.select().from(t.sopValidations).where(eq(t.sopValidations.revisionId, revisionId)).orderBy(desc(t.sopValidations.runAt)).limit(1);
  if (!v) return null;
  const [rev] = await db.select({ updatedAt: t.sopRevisions.updatedAt }).from(t.sopRevisions).where(eq(t.sopRevisions.id, revisionId));
  return { ...(v.results as unknown as CheckAgainResult), stale: !!rev?.updatedAt && rev.updatedAt > v.runAt };
}

/** Revision labels by id, for the revision chips. Sessions without one ran on revision A. */
export async function revisionLabels(): Promise<Map<string, string>> {
  return new Map((await runnableRevisions()).filter((r) => r.id).map((r) => [r.id as string, r.label]));
}
