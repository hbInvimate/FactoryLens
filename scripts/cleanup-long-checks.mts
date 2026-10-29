// npm run db:cleanup-long                 DRY RUN: lists every check whose stored total time is over 15 minutes (sample data too).
// npm run db:cleanup-long -- --confirm    Saves those checks and all their rows to backups/long-checks-<date>.json, then
//                                         deletes them in one transaction. Works on the database in DATABASE_URL.
// Stored total time: the stored check time (complete checks), else the stored duration, else start to end (or to the
// last save) on the clock, which is what older code counted. The target is 45:00.
import { mkdirSync, writeFileSync } from "node:fs";
import { asc, inArray, sql, type SQL } from "drizzle-orm";
import * as t from "../db/schema";
import { durationMs, reduce } from "../lib/check/reducer";
import type { Action } from "../lib/check/types";
import { fmtDuration } from "../lib/format";
import { getRepo } from "../lib/server/repo";

const LIMIT_SECONDS = 15 * 60;
const confirm = process.argv.includes("--confirm");

const { db, batch } = await getRepo().conn();
/** Raw rows of a query (Neon and PGlite answer in different shapes). */
async function raw(q: SQL): Promise<Record<string, unknown>[]> {
  const res = (await db.execute(q)) as unknown as { rows?: Record<string, unknown>[] } | Record<string, unknown>[];
  return Array.isArray(res) ? res : (res.rows ?? []);
}

// duration_seconds exists only once migration 0012 has run.
const hasDuration =
  (await raw(sql`select 1 from information_schema.columns where table_name = 'sessions' and column_name = 'duration_seconds'`)).length > 0;

const rows = await db
  .select({
    id: t.sessions.id,
    startedAt: t.sessions.startedAt,
    endedAt: t.sessions.endedAt,
    updatedAt: t.sessions.updatedAt,
    status: t.sessions.status,
    operator: t.sessions.operatorLabel,
    stepsDone: t.sessions.stepsDone,
    activeSeconds: t.sessions.activeSeconds,
    isSample: t.sessions.isSample,
  })
  .from(t.sessions)
  .orderBy(asc(t.sessions.startedAt));

const durations = new Map<string, number | null>();
if (hasDuration) {
  for (const r of await raw(sql`select id, duration_seconds from sessions`)) {
    durations.set(String(r.id), r.duration_seconds === null ? null : Number(r.duration_seconds));
  }
}

const stored = (r: (typeof rows)[number]): { seconds: number; basis: string } => {
  if (r.activeSeconds !== null) return { seconds: r.activeSeconds, basis: "check time" };
  const d = durations.get(r.id);
  if (d !== null && d !== undefined) return { seconds: d, basis: "duration" };
  return { seconds: Math.round(((r.endedAt ?? r.updatedAt).getTime() - r.startedAt.getTime()) / 1000), basis: "clock" };
};

const long = rows.map((r) => ({ r, s: stored(r) })).filter((x) => x.s.seconds > LIMIT_SECONDS);
const ids = long.map((x) => x.r.id);

// Active time from each check's own log, the way the app counts it now.
const acts = ids.length ? await db.select().from(t.sessionActions).where(inArray(t.sessionActions.sessionId, ids)).orderBy(asc(t.sessionActions.seq)) : [];
const active = (id: string, startedAt: Date) => {
  const log = acts.filter((a) => a.sessionId === id).map((a) => ({ ...(a.payload as object), id: a.id, seq: a.seq, at: a.at.getTime(), type: a.type }) as Action);
  const ms = durationMs(reduce(log, startedAt.getTime()));
  return ms === null ? "–" : fmtDuration(ms / 1000);
};

const table = long.map(({ r, s }) => ({
  id: r.id,
  started: r.startedAt.toISOString().slice(0, 16).replace("T", " "),
  technician: r.operator + (r.isSample ? " [sample]" : ""),
  status: r.status,
  steps: `${r.stepsDone}/12`,
  "stored time": `${fmtDuration(s.seconds)} (${s.basis})`,
  "active time": active(r.id, r.startedAt),
}));

console.log(`Checks with a stored total time over 00:15:00 (target 45:00), sample data included:`);
if (table.length) console.table(table);
console.log(`${table.length} of ${rows.length} checks.`);

if (!confirm) {
  console.log("DRY RUN: nothing was deleted. To delete these, run: npm run db:cleanup-long -- --confirm");
  process.exit(0);
}
if (!ids.length) {
  console.log("Nothing to delete.");
  process.exit(0);
}

// 1. Back up every affected row first.
const [sessions, actions, stepEvents, points, discrepancies, handoffs, measurements, tasks, clipRefs] = await Promise.all([
  // select *: works before and after migration 0012 (duration_seconds).
  raw(sql`select * from sessions where id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`),
  db.select().from(t.sessionActions).where(inArray(t.sessionActions.sessionId, ids)),
  db.select().from(t.stepEvents).where(inArray(t.stepEvents.sessionId, ids)),
  db.select().from(t.pointConfirmations).where(inArray(t.pointConfirmations.sessionId, ids)),
  db.select().from(t.discrepancies).where(inArray(t.discrepancies.sessionId, ids)),
  db.select().from(t.handoffItems).where(inArray(t.handoffItems.sessionId, ids)),
  db.select().from(t.measurements).where(inArray(t.measurements.sessionId, ids)),
  db.select().from(t.tasks).where(inArray(t.tasks.sessionId, ids)),
  db.select().from(t.sopClipRefs).where(inArray(t.sopClipRefs.sessionId, ids)),
]);
mkdirSync("backups", { recursive: true });
const file = `backups/long-checks-${new Date().toISOString().slice(0, 10)}.json`;
writeFileSync(
  file,
  JSON.stringify({ savedAt: new Date().toISOString(), reason: "stored total time over 15 minutes", sessions, actions, stepEvents, points, discrepancies, handoffs, measurements, tasks, clipRefs }, null, 2),
);
console.log(`Backup saved: ${file} (${sessions.length} checks, ${actions.length} actions).`);

// 2. Delete in one transaction. Tasks that started one of these checks go back to Not started.
await batch([
  db.delete(t.handoffItems).where(inArray(t.handoffItems.sessionId, ids)),
  db.delete(t.measurements).where(inArray(t.measurements.sessionId, ids)),
  db.delete(t.pointConfirmations).where(inArray(t.pointConfirmations.sessionId, ids)),
  db.delete(t.stepEvents).where(inArray(t.stepEvents.sessionId, ids)),
  db.delete(t.discrepancies).where(inArray(t.discrepancies.sessionId, ids)),
  db.delete(t.sessionActions).where(inArray(t.sessionActions.sessionId, ids)),
  db.delete(t.sopClipRefs).where(inArray(t.sopClipRefs.sessionId, ids)),
  db.update(t.tasks).set({ sessionId: null }).where(inArray(t.tasks.sessionId, ids)),
  db.delete(t.sessions).where(inArray(t.sessions.id, ids)),
]);
console.log(`Deleted ${ids.length} checks and their rows.`);
