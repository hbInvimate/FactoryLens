// The Quality Technician's Sessions page: last-used values for the start card, their stats, recent checks and the
// "Before you start" tip. Real data only, from their own checks.
import { and, desc, eq, gte } from "drizzle-orm";
import * as t from "@/db/schema";
import { isRightFirstTime, reduce } from "@/lib/check/reducer";
import { deviationText } from "@/lib/check/text";
import type { SessionStatus } from "@/lib/check/types";
import { PLANT_TIME_ZONE } from "@/lib/config";
import { plantDay, plantMinutes, shiftOf } from "@/lib/shifts";
import { SESSION_DEFAULTS, STEPS } from "@/lib/sop";
import { checkTargetSeconds } from "@/lib/sop-revisions";
import { getRepo } from "./repo";
import { activeRevision } from "./sop";
import { withActions } from "./sopData";

const DAY = 86_400_000;

export interface TechHome {
  firstName: string;
  greeting: string;
  cell: string;
  shift: string;
  /** Last-used values for the start card, and the choices. */
  last: { part: string; station: string };
  parts: string[];
  stations: string[];
  /** The Active SOP: when it became active, and whether it changed since their last check. */
  sop: { id: string | null; label: string; takt: number | null; activatedAt: string | null; changedSinceLast: boolean };
  today: { started: number; complete: number };
  /** Completed checks in the last 8 weeks: every step right first time (the shared rule). */
  rft: { right: number; of: number };
  avgCycleSeconds: number | null;
  /** Completed checks right first time in a row, newest first. */
  streak: number;
  recent: { id: string; finishedAt: string; part: string; station: string; status: SessionStatus; cycleSeconds: number | null; conformance: number | null }[];
  /** One tip from their recent misses, or null when the recent checks were clean. */
  tip: { lead: string; text: string } | null;
  recentClean: number;
}

const cellOf = (station: string) => station.split(" · ")[0];

export async function techHome(user: { id: string; name: string }, stations: string[], now = Date.now()): Promise<TechHome> {
  const { db } = await getRepo().conn();
  const [rows, tasks, rev, revRows] = await Promise.all([
    db.select().from(t.sessions).where(and(eq(t.sessions.userId, user.id), gte(t.sessions.startedAt, new Date(now - 56 * DAY)))).orderBy(desc(t.sessions.startedAt)).limit(300),
    db.select({ part: t.tasks.part }).from(t.tasks).where(eq(t.tasks.assignedTo, user.id)),
    activeRevision(),
    db.select({ id: t.sopRevisions.id, activatedAt: t.sopRevisions.activatedAt }).from(t.sopRevisions),
  ]);
  const lastRow = rows[0];
  const last = { part: lastRow?.part ?? SESSION_DEFAULTS.part, station: (lastRow?.station ?? lastRow?.fixture ?? SESSION_DEFAULTS.fixture).trim() };
  const done = rows.filter((r) => r.status === "complete");
  const states = new Map((await withActions(db, done)).map((s) => [s.id, reduce(s.actions, s.startedAt)]));
  const allRight = (id: string) => {
    const st = states.get(id);
    return !!st && STEPS.every((s) => isRightFirstTime(st, s.n));
  };
  let streak = 0;
  for (const r of done) {
    if (!allRight(r.id)) break;
    streak++;
  }
  // The tip: the steps they missed most in their last 5 completed checks, with the first deviation's correction.
  const recentDone = done.slice(0, 5);
  const missed = new Map<number, number>();
  let example: string | null = null;
  for (const r of recentDone) {
    const st = states.get(r.id);
    if (!st) continue;
    for (const s of STEPS) if (!isRightFirstTime(st, s.n)) missed.set(s.n, (missed.get(s.n) ?? 0) + 1);
    example ??= st.deviations[0] ? deviationText(st.deviations[0]).correction : null;
  }
  const worst = [...missed.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 2).map(([n]) => n).sort((a, b) => a - b);
  const misses = [...missed.values()].reduce((a, b) => a + b, 0);
  const today = plantDay(now);
  const cycles = done.map((r) => r.activeSeconds).filter((x): x is number => x !== null);
  const hour = Math.floor(plantMinutes(now, PLANT_TIME_ZONE) / 60);
  // Their last check ran on its stored revision; an older one without it ran on revision A.
  const changedSinceLast = !!lastRow && (lastRow.sopRevisionId ? lastRow.sopRevisionId !== rev.id : rev.label !== "A");
  const activatedAt = revRows.find((r) => r.id === rev.id)?.activatedAt ?? null;
  return {
    firstName: user.name.split(/\s+/)[0],
    greeting: hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening",
    cell: cellOf(last.station),
    shift: `Shift ${shiftOf(now)}`,
    last,
    parts: [...new Set([last.part, SESSION_DEFAULTS.part, ...rows.map((r) => r.part), ...tasks.map((x) => x.part)])],
    stations: [...new Set([last.station, ...stations])],
    sop: {
      id: rev.id,
      label: rev.label,
      takt: checkTargetSeconds(rev),
      activatedAt: activatedAt ? activatedAt.toISOString() : null,
      changedSinceLast,
    },
    today: {
      started: rows.filter((r) => plantDay(r.startedAt.getTime()) === today).length,
      complete: done.filter((r) => plantDay(r.startedAt.getTime()) === today).length,
    },
    rft: { right: done.filter((r) => allRight(r.id)).length, of: done.length },
    avgCycleSeconds: cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : null,
    streak,
    recent: done.slice(0, 3).map((r) => ({
      id: r.id, finishedAt: (r.endedAt ?? r.updatedAt).toISOString(), part: r.part, station: r.station ?? r.fixture, status: r.status as SessionStatus,
      cycleSeconds: r.activeSeconds, conformance: r.conformance,
    })),
    tip: worst.length
      ? {
          lead: `Watch step${worst.length === 1 ? "" : "s"} ${worst.join(" and ")}.`,
          text: `Your ${misses} ${misses === 1 ? "miss" : "misses"} in your last ${recentDone.length} checks ${misses === 1 ? "was" : "were"} at ${worst.map((n) => STEPS[n - 1].short.toLowerCase()).join(" and ")}${example ? `: ${example}` : "."}`,
        }
      : null,
    recentClean: recentDone.length,
  };
}
