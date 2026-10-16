// Reads SOP revisions from the database. When the database has none (or cannot be read), the check app
// falls back to lib/sop.ts, which is revision A, so a check can always run.
import { and, asc, eq, inArray, isNotNull, type SQL } from "drizzle-orm";
import type { Conn } from "@/db/client";
import * as t from "@/db/schema";
import { CODE_REVISION, REV_A_ID, SOP_SCOPE, type SopRevisionText } from "@/lib/sop-revisions";
import { getRepo } from "./repo";

async function conn(): Promise<Conn> {
  return getRepo().conn();
}

function toText(rev: typeof t.sopRevisions.$inferSelect, steps: (typeof t.sopStepRevisions.$inferSelect)[]): SopRevisionText | null {
  const sorted = [...steps].sort((a, b) => a.step - b.step);
  // Exactly 12 steps, 1 to 12. Anything else is not used.
  if (sorted.length !== 12 || sorted.some((s, i) => s.step !== i + 1)) return null;
  return {
    id: rev.id,
    label: rev.label,
    steps: sorted.map((s) => ({
      todo: s.todo, correct: s.correct, mistake: s.mistake, rule: s.rule, spoken: s.spoken,
      referenceNote: s.referenceNote, targetCtSeconds: s.targetCtSeconds,
    })),
  };
}

async function load(where: SQL | undefined, c?: Conn): Promise<SopRevisionText[]> {
  const { db } = c ?? (await conn());
  const revs = await db.select().from(t.sopRevisions).where(where).orderBy(asc(t.sopRevisions.label));
  if (!revs.length) return [];
  const steps = await db.select().from(t.sopStepRevisions).where(inArray(t.sopStepRevisions.revisionId, revs.map((r) => r.id)));
  return revs.map((r) => toText(r, steps.filter((s) => s.revisionId === r.id))).filter((x): x is SopRevisionText => x !== null);
}

/** The Active revision, or lib/sop.ts when the database has none. Never throws. */
export async function activeRevision(c?: Conn): Promise<SopRevisionText> {
  try {
    const [rev] = await load(and(eq(t.sopRevisions.scope, SOP_SCOPE), eq(t.sopRevisions.status, "active")), c);
    return rev ?? CODE_REVISION;
  } catch (e) {
    console.error("SOP revisions could not be read; using lib/sop.ts.", (e as Error).message);
    return CODE_REVISION;
  }
}

/**
 * Every revision a check may run on: the ones that were ever activated (Active or Retired), so a check
 * started on an older revision finishes on it. Drafts are never included. Never throws.
 */
export async function runnableRevisions(c?: Conn): Promise<SopRevisionText[]> {
  try {
    const revs = await load(and(eq(t.sopRevisions.scope, SOP_SCOPE), isNotNull(t.sopRevisions.activatedAt)), c);
    return revs.length ? revs : [CODE_REVISION];
  } catch (e) {
    console.error("SOP revisions could not be read; using lib/sop.ts.", (e as Error).message);
    return [CODE_REVISION];
  }
}

/** For saving a session: the revision id if a check may run on it, else null (the session then counts as revision A). */
export async function runnableRevisionId(id: string | undefined, c?: Conn): Promise<string | null> {
  if (!id) return null;
  try {
    const { db } = c ?? (await conn());
    const [r] = await db
      .select({ id: t.sopRevisions.id })
      .from(t.sopRevisions)
      .where(and(eq(t.sopRevisions.id, id), isNotNull(t.sopRevisions.activatedAt)));
    return r?.id ?? null;
  } catch {
    return null;
  }
}

/** The revision a session ran on. Older sessions have none: they count as revision A. */
export function revisionIdOf(sopRevisionId: string | null | undefined): string {
  return sopRevisionId ?? REV_A_ID;
}
