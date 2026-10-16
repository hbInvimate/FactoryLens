// "Review this way" (one-click-flow.md part 2): one click builds a Draft from a candidate's checks and
// stores the suggestions; the Quality Engineer accepts, edits or rejects each one. Every action is audited.
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import type { AnyDb } from "@/db/client";
import * as t from "@/db/schema";
import { checkRows, findCandidates } from "@/lib/sop-candidates";
import { compare } from "@/lib/sop-suggest";
import { parseMmss } from "@/lib/sop-stats";
import type { SopRevisionText } from "@/lib/sop-revisions";
import { getRepo } from "./repo";
import { activeRevision } from "./sop";
import { SopRuleError, completedSessions, openDraft } from "./sopData";
import type { DashFilter } from "./sqlparts";

type Who = { id: string; name: string };

async function audit(db: AnyDb, who: Who, action: string, revisionId: string, step: number | null, reason: string | null, detail: Record<string, unknown>) {
  await db.insert(t.sopAudit).values({ id: randomUUID(), at: new Date(), actorId: who.id, actorName: who.name, action, revisionId, step, reason, detail });
}

/**
 * Builds (or fills) the Draft from one candidate's checks in this view. Real checks only, whatever the
 * sample switch says. A draft that already has suggestions is not built again: open it instead.
 */
export async function startReview(who: Who, f: Omit<DashFilter, "includeSample">, candidateKey: string): Promise<{ revisionId: string; label: string }> {
  const conn = await getRepo().conn();
  const { db } = conn;
  const filter: DashFilter = { ...f, includeSample: false };
  const [active, sessions] = await Promise.all([activeRevision(conn), completedSessions(filter, conn)]);
  const found = findCandidates(sessions, active.steps.map((s) => s.targetCtSeconds));
  const cand = found.candidates.find((c) => c.who === candidateKey);
  if (!cand) throw new SopRuleError("This Quality Technician is not listed as a way of working worth a look in this view any more.");

  const now = new Date();
  const [open] = await db.select().from(t.sopRevisions).where(eq(t.sopRevisions.status, "draft")).limit(1);
  if (open) {
    const [has] = await db.select({ id: t.sopSuggestions.id }).from(t.sopSuggestions).where(eq(t.sopSuggestions.revisionId, open.id)).limit(1);
    if (has) throw Object.assign(new SopRuleError(`Draft revision ${open.label} is already being reviewed. Open it to carry on.`), { revisionId: open.id });
  }
  const { draft, created } = await openDraft(db, who.name, active, now);
  const result = compare(cand.checks, checkRows(sessions), active.steps);

  await db
    .update(t.sopRevisions)
    .set({ sourceLabel: cand.label, sourceSessionIds: cand.checks.map((c) => c.id), updatedAt: now })
    .where(eq(t.sopRevisions.id, draft.id));
  if (result.changes.length) {
    await db.insert(t.sopSuggestions).values(
      result.changes.map((c) => ({
        id: randomUUID(), revisionId: draft.id, step: c.step, type: c.type, oldValue: c.oldValue, proposedValue: c.newValue, newValue: c.newValue,
        why: c.why, detail: c.detail, warning: c.warning, sourceSessionIds: c.sourceSessionIds, status: "proposed", createdAt: now,
      })),
    );
  }
  if (result.clips.length) {
    await db.insert(t.sopClipRefs).values(result.clips.map((c) => ({ id: randomUUID(), revisionId: draft.id, ...c })));
  }
  if (created) await audit(db, who, "draft_created", draft.id, null, null, { label: draft.label, copiedFrom: active.id ?? "lib/sop.ts", by: "review_this_way" });
  await audit(db, who, "review_started", draft.id, null, null, {
    candidate: cand.label,
    sessions: cand.checks.map((c) => c.id),
    suggestions: result.changes.map((c) => ({ step: c.step, type: c.type, newValue: c.newValue, warning: c.warning })),
    noChange: result.noChange,
  });
  return { revisionId: draft.id, label: draft.label };
}

export type SuggestionAction = "accept" | "edit" | "reject";

/** The Active revision's value for a field, to put back when an applied suggestion is rejected. */
function activeValue(active: SopRevisionText, step: number, type: string): { targetCtSeconds?: number | null; todo?: string } {
  const s = active.steps[step - 1];
  return type === "time" ? { targetCtSeconds: s?.targetCtSeconds ?? null } : { todo: s?.todo ?? "" };
}

/** Accept, edit or reject one suggestion. Accepted and edited ones are written into the draft; rejected ones change nothing. */
export async function actOnSuggestion(who: Who, id: string, action: SuggestionAction, value?: string): Promise<{ status: string; newValue: string }> {
  const conn = await getRepo().conn();
  const { db } = conn;
  const [s] = await db.select().from(t.sopSuggestions).where(eq(t.sopSuggestions.id, id));
  if (!s) throw new SopRuleError("No such suggestion.");
  const [rev] = await db.select().from(t.sopRevisions).where(eq(t.sopRevisions.id, s.revisionId));
  if (!rev || rev.status !== "draft") throw new SopRuleError("Only a draft revision can be changed.");
  const now = new Date();
  const wasApplied = s.status === "accepted" || s.status === "edited";

  let newValue = s.newValue;
  let status: string;
  if (action === "accept") {
    status = "accepted";
  } else if (action === "edit") {
    const v = (value ?? "").trim();
    if (s.type === "time") {
      const secs = parseMmss(v);
      if (secs === null) throw new SopRuleError("Enter the CT as mm:ss, from 00:01 to 59:59.");
      newValue = String(secs);
    } else {
      if (!v || v.length > 2000) throw new SopRuleError("Write the new text (1 to 2000 characters).");
      newValue = v;
    }
    status = "edited";
  } else if (action === "reject") {
    status = "rejected";
  } else {
    throw new SopRuleError("Unknown action.");
  }

  const where = and(eq(t.sopStepRevisions.revisionId, s.revisionId), eq(t.sopStepRevisions.step, s.step));
  if (status === "rejected") {
    // Nothing was applied: nothing to undo. Applied before: put the Active revision's value back.
    if (wasApplied) await db.update(t.sopStepRevisions).set(activeValue(await activeRevision(conn), s.step, s.type)).where(where);
  } else {
    await db.update(t.sopStepRevisions).set(s.type === "time" ? { targetCtSeconds: Number(newValue) } : { todo: newValue }).where(where);
  }
  await db.update(t.sopSuggestions).set({ status, newValue, decidedBy: who.name, decidedAt: now }).where(eq(t.sopSuggestions.id, id));
  await db.update(t.sopRevisions).set({ updatedAt: now }).where(eq(t.sopRevisions.id, s.revisionId));
  await audit(db, who, `suggestion_${status}`, s.revisionId, s.step, null, {
    suggestionId: id, type: s.type, proposed: s.proposedValue, from: s.newValue, to: newValue, wasApplied,
  });
  return { status, newValue };
}

export interface ReviewData {
  revision: typeof t.sopRevisions.$inferSelect;
  suggestions: (typeof t.sopSuggestions.$inferSelect)[];
  clips: (typeof t.sopClipRefs.$inferSelect)[];
  steps: (typeof t.sopStepRevisions.$inferSelect)[];
  /** The check the clip references point at (the candidate's latest). */
  latest: { sessionId: string; startedAt: string } | null;
}

export async function reviewData(revisionId: string): Promise<ReviewData | null> {
  const { db } = await getRepo().conn();
  const [revision] = await db.select().from(t.sopRevisions).where(eq(t.sopRevisions.id, revisionId));
  if (!revision) return null;
  const [suggestions, clips, steps] = await Promise.all([
    db.select().from(t.sopSuggestions).where(eq(t.sopSuggestions.revisionId, revisionId)).orderBy(asc(t.sopSuggestions.step), desc(t.sopSuggestions.type)), // time before order
    db.select().from(t.sopClipRefs).where(eq(t.sopClipRefs.revisionId, revisionId)).orderBy(asc(t.sopClipRefs.step)),
    db.select().from(t.sopStepRevisions).where(eq(t.sopStepRevisions.revisionId, revisionId)).orderBy(asc(t.sopStepRevisions.step)),
  ]);
  let latest: ReviewData["latest"] = null;
  if (clips[0]) {
    const [s] = await db.select({ startedAt: t.sessions.startedAt }).from(t.sessions).where(eq(t.sessions.id, clips[0].sessionId));
    if (s) latest = { sessionId: clips[0].sessionId, startedAt: s.startedAt.toISOString() };
  }
  return { revision, suggestions, clips, steps, latest };
}
