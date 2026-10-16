// "Update SOP": the Quality Engineer picks one finished real check done correctly first time ("Use this way").
// The existing comparison runs on that check against the Active SOP and the station's other checks, and the
// result is kept as a Draft. Confirm applies all of it (all or nothing) with the existing activation: new
// checks only. Discard changes nothing. Confirm is safe to send twice: only one revision is ever activated.
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { AnyDb } from "@/db/client";
import * as t from "@/db/schema";
import { checkRows, type CheckRow } from "@/lib/sop-candidates";
import { compare } from "@/lib/sop-suggest";
import { SOP_SCOPE } from "@/lib/sop-revisions";
import type { StatSession } from "@/lib/sop-stats";
import { getRepo } from "./repo";
import { activeRevision } from "./sop";
import { SopRuleError, completedSessions, openDraft } from "./sopData";

type Who = { id: string; name: string };

async function audit(db: AnyDb, who: Who, action: string, revisionId: string | null, reason: string | null, detail: Record<string, unknown>) {
  await db.insert(t.sopAudit).values({ id: randomUUID(), at: new Date(), actorId: who.id, actorName: who.name, action, revisionId, reason, detail });
}

/** A finished, real check with all 12 steps correct on the first attempt. */
export function correctFirstTime(r: CheckRow): boolean {
  return !r.isSample && r.checkSeconds !== null && r.correct.length === 12 && r.correct.every(Boolean);
}

export interface LastSession {
  id: string;
  startedAt: number;
  label: string;
  checkSeconds: number;
}

/** "Last sessions" for Update SOP: newest first, real, finished, correct first time. */
export function lastSessions(sessions: StatSession[], limit = 50): LastSession[] {
  return checkRows(sessions.filter((s) => !s.isSample))
    .filter(correctFirstTime)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit)
    .map((r) => ({ id: r.id, startedAt: r.startedAt, label: r.label, checkSeconds: r.checkSeconds as number }));
}

export type Proposal = { revisionId: string; label: string; changes: number } | { noChange: true };

/** Runs the comparison on one check and keeps the result as a Draft. Nothing changes in the SOP. */
export async function proposeFromSession(who: Who, sessionId: string): Promise<Proposal> {
  const conn = await getRepo().conn();
  const { db } = conn;
  const [row] = await db.select().from(t.sessions).where(eq(t.sessions.id, sessionId));
  if (!row) throw new SopRuleError("This check was not found.");
  if (row.isSample) throw new SopRuleError("Sample checks cannot be used.");
  if (row.status !== "complete") throw new SopRuleError("Only finished checks can be used.");
  const station = row.station ?? row.fixture.trim();
  const [active, sessions] = await Promise.all([activeRevision(conn), completedSessions({ station, since: null, shift: null, includeSample: false }, conn)]);
  const rows = checkRows(sessions);
  const chosen = rows.filter((r) => r.id === sessionId);
  if (!chosen.length || !correctFirstTime(chosen[0])) throw new SopRuleError("Only checks done correctly the first time can be used.");

  const result = compare(chosen, rows, active.steps);
  if (!result.changes.length) {
    await audit(db, who, "update_no_difference", null, null, { sessionId, station });
    return { noChange: true };
  }
  const [open] = await db.select().from(t.sopRevisions).where(and(eq(t.sopRevisions.scope, SOP_SCOPE), eq(t.sopRevisions.status, "draft"))).limit(1);
  if (open) throw new SopRuleError(`Draft revision ${open.label} is still open in SOP history. Finish or discard it first.`);

  const now = new Date();
  const { draft } = await openDraft(db, who.name, active, now);
  await db.update(t.sopRevisions).set({ sourceLabel: row.operatorLabel, sourceSessionIds: [sessionId], updatedAt: now }).where(eq(t.sopRevisions.id, draft.id));
  await db.insert(t.sopSuggestions).values(
    result.changes.map((c) => ({
      id: randomUUID(), revisionId: draft.id, step: c.step, type: c.type, oldValue: c.oldValue, proposedValue: c.newValue, newValue: c.newValue,
      why: c.why, detail: c.detail, warning: c.warning, sourceSessionIds: c.sourceSessionIds, status: "proposed", createdAt: now,
    })),
  );
  if (result.clips.length) await db.insert(t.sopClipRefs).values(result.clips.map((c) => ({ id: randomUUID(), revisionId: draft.id, ...c })));
  await audit(db, who, "update_proposed", draft.id, null, {
    sessionId, station, label: draft.label, changes: result.changes.map((c) => ({ step: c.step, type: c.type, newValue: c.newValue })),
  });
  return { revisionId: draft.id, label: draft.label, changes: result.changes.length };
}

/**
 * "Confirm and update SOP": applies every proposed change and makes the Draft the Active revision.
 * Idempotent: a second Confirm (a double click, or a Retry after a lost answer) finds it already active
 * and changes nothing. The draft is claimed first, so two Confirms at once cannot both activate.
 */
export async function confirmUpdate(who: Who, revisionId: string): Promise<{ label: string; already: boolean }> {
  const conn = await getRepo().conn();
  const { db, batch } = conn;
  const now = new Date();
  // Claim the draft: only one Confirm can move it out of "draft".
  const [claimed] = await db
    .update(t.sopRevisions)
    .set({ status: "confirming", updatedAt: now })
    .where(and(eq(t.sopRevisions.id, revisionId), eq(t.sopRevisions.status, "draft")))
    .returning();
  if (!claimed) {
    const [rev] = await db.select().from(t.sopRevisions).where(eq(t.sopRevisions.id, revisionId));
    if (!rev) throw new SopRuleError("No such proposal.");
    if (rev.status === "active" || (rev.status === "retired" && rev.activatedAt)) return { label: rev.label, already: true };
    if (rev.status === "confirming") throw new SopRuleError("This update is being saved. Wait a moment, then press Retry.");
    throw new SopRuleError(rev.status === "discarded" ? "This proposal was discarded." : "This proposal can no longer be confirmed.");
  }
  try {
    const sugs = await db.select().from(t.sopSuggestions).where(eq(t.sopSuggestions.revisionId, revisionId));
    for (const s of sugs.filter((x) => x.status !== "rejected")) {
      await db
        .update(t.sopStepRevisions)
        .set(s.type === "time" ? { targetCtSeconds: Number(s.newValue) } : { todo: s.newValue })
        .where(and(eq(t.sopStepRevisions.revisionId, revisionId), eq(t.sopStepRevisions.step, s.step)));
    }
    if (sugs.length) {
      await db.update(t.sopSuggestions).set({ status: "accepted", decidedBy: who.name, decidedAt: now }).where(and(eq(t.sopSuggestions.revisionId, revisionId), inArray(t.sopSuggestions.status, ["proposed"])));
    }
    const ids = [...new Set([...(claimed.sourceSessionIds ?? []), ...sugs.flatMap((s) => s.sourceSessionIds)])];
    if (ids.length) {
      const samples = await db.select({ id: t.sessions.id }).from(t.sessions).where(and(inArray(t.sessions.id, ids), eq(t.sessions.isSample, true)));
      if (samples.length) throw new SopRuleError("This proposal rests on SAMPLE data, so it cannot be used.");
    }
    const [current] = await db.select().from(t.sopRevisions).where(and(eq(t.sopRevisions.scope, SOP_SCOPE), eq(t.sopRevisions.status, "active")));
    const reason = `Confirmed in Update SOP: the way of working in the check by ${claimed.sourceLabel ?? "a Quality Technician"}.`;
    await batch([
      ...(current ? [db.update(t.sopRevisions).set({ status: "retired" }).where(eq(t.sopRevisions.id, current.id))] : []),
      db.update(t.sopRevisions).set({ status: "active", activatedBy: who.name, activatedAt: now, effectiveFrom: now, changeReason: reason }).where(eq(t.sopRevisions.id, revisionId)),
    ]);
    await audit(db, who, "activated", revisionId, reason, { label: claimed.label, from: current?.id ?? null, fromLabel: current?.label ?? null, by: "update_sop", evidenceSessions: ids.length, effectiveFrom: now.toISOString() });
    await audit(db, who, "update_confirmed", revisionId, null, { label: claimed.label, confirmedAt: now.toISOString() });
    return { label: claimed.label, already: false };
  } catch (e) {
    // Let Retry try again from the start: back to a draft, nothing activated.
    await db.update(t.sopRevisions).set({ status: "draft" }).where(and(eq(t.sopRevisions.id, revisionId), eq(t.sopRevisions.status, "confirming")));
    throw e;
  }
}

/** The revision this one replaced when it was made active (for "Go back to rev A"), from the audit log. */
export async function replacedBy(revisionId: string): Promise<{ id: string; label: string; status: string } | null> {
  const { db } = await getRepo().conn();
  const entries = await db.select().from(t.sopAudit).where(and(eq(t.sopAudit.revisionId, revisionId), eq(t.sopAudit.action, "activated")));
  const from = (entries.sort((a, b) => b.at.getTime() - a.at.getTime())[0]?.detail as { from?: string | null } | null)?.from;
  if (!from) return null;
  const [r] = await db.select({ id: t.sopRevisions.id, label: t.sopRevisions.label, status: t.sopRevisions.status }).from(t.sopRevisions).where(eq(t.sopRevisions.id, from));
  return r ?? null;
}

/** "Discard": the proposal is kept for the record as Discarded. The SOP does not change. */
export async function discardUpdate(who: Who, revisionId: string): Promise<void> {
  const { db } = await getRepo().conn();
  const [done] = await db
    .update(t.sopRevisions)
    .set({ status: "discarded", updatedAt: new Date() })
    .where(and(eq(t.sopRevisions.id, revisionId), eq(t.sopRevisions.status, "draft")))
    .returning({ label: t.sopRevisions.label });
  if (!done) throw new SopRuleError("Only a proposal that is not confirmed yet can be discarded.");
  await audit(db, who, "discarded", revisionId, null, { label: done.label });
}
