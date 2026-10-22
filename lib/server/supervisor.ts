// The Supervisor pages (/supervisor): read-only figures from real sessions (never sample data).
// First-time right: a completed check with all 12 steps correct on the first attempt.
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import { reduce, stepActiveMs } from "@/lib/check/reducer";
import { ENDED_STATUSES, ON_HOLD_STATUSES, type DeviationKind, type SessionStatus } from "@/lib/check/types";
import { STEPS } from "@/lib/sop";
import { getRepo } from "./repo";
import { activeRevision } from "./sop";
import { stationExpr } from "./sqlparts";
import { withActions } from "./sopData";

const DAY = 86_400_000;
const LIVE: SessionStatus[] = ["running", "paused", "on_hold", "stopped"];
const real = sql`coalesce(${t.sessions.isSample}, false) = false`;

type Row = typeof t.sessions.$inferSelect;
const ftr = (r: Row) => r.status === "complete" && r.correctFirstTime >= 12;
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : null);

async function recent(days: number): Promise<Row[]> {
  const { db } = await getRepo().conn();
  return db.select().from(t.sessions).where(and(real, gte(t.sessions.startedAt, new Date(Date.now() - days * DAY)))).orderBy(desc(t.sessions.startedAt)).limit(3000);
}

export interface LiveCheck {
  id: string;
  part: string;
  station: string;
  operator: string;
  status: SessionStatus;
  step: number;
  startedAt: string;
}

const live = (r: Row): LiveCheck => ({
  id: r.id, part: r.part, station: r.station ?? r.fixture, operator: r.operatorLabel, status: r.status as SessionStatus, step: Math.min(r.currentStep, 12), startedAt: r.startedAt.toISOString(),
});

export interface Alert {
  id: string;
  tone: "red" | "amber";
  text: string;
  at: string;
}

export interface Overview {
  ongoing: LiveCheck[];
  checksToday: number;
  onHold: number;
  /** Last 7 days. Null without a completed check. */
  ftrPct: number | null;
  completed7: number;
  alerts: Alert[];
}

/** Home: the 4 KPI figures, the checks in progress, and alerts (holds, open deviations, checks left). */
export async function overview(now = new Date()): Promise<Overview> {
  const { db } = await getRepo().conn();
  const [rows, open] = await Promise.all([
    recent(7),
    db.select().from(t.sessions).where(and(real, inArray(t.sessions.status, LIVE))).orderBy(desc(t.sessions.startedAt)).limit(200),
  ]);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const done = rows.filter((r) => r.status === "complete");
  const alerts: Alert[] = [];
  for (const r of open) {
    if (ON_HOLD_STATUSES.includes(r.status as SessionStatus)) alerts.push({ id: r.id, tone: "red", text: `On hold at step ${Math.min(r.currentStep, 12)}: ${r.part} · ${r.station ?? r.fixture}, ${r.operatorLabel}`, at: r.updatedAt.toISOString() });
    else if (r.deviations > 0) alerts.push({ id: r.id, tone: "amber", text: `${r.deviations} deviation${r.deviations === 1 ? "" : "s"} so far: ${r.part}, ${r.operatorLabel}`, at: r.updatedAt.toISOString() });
  }
  for (const r of rows.filter((x) => x.status === "left" && x.updatedAt.getTime() > now.getTime() - DAY)) {
    alerts.push({ id: r.id, tone: "amber", text: `Check left before the end: ${r.part}, ${r.operatorLabel}`, at: r.updatedAt.toISOString() });
  }
  return {
    ongoing: open.map(live),
    checksToday: rows.filter((r) => r.startedAt >= today).length,
    onHold: open.filter((r) => ON_HOLD_STATUSES.includes(r.status as SessionStatus)).length,
    ftrPct: pct(done.filter(ftr).length, done.length),
    completed7: done.length,
    alerts: alerts.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20),
  };
}

export interface TeamMember {
  id: string;
  name: string;
  checks30: number;
  completed30: number;
  ftrPct: number | null;
  /** Median check time of completed checks, seconds. */
  medianSeconds: number | null;
  current: LiveCheck | null;
  lastAt: string | null;
}

/** Team: every Quality Technician who can sign in, with their last 30 days. */
export async function team(): Promise<TeamMember[]> {
  const { db } = await getRepo().conn();
  const [people, rows] = await Promise.all([
    db.select({ id: t.users.id, name: t.users.name }).from(t.users).where(and(eq(t.users.role, "technician"), eq(t.users.disabled, false))).orderBy(t.users.name),
    recent(30),
  ]);
  return people.map((p) => {
    const mine = rows.filter((r) => r.userId === p.id);
    const done = mine.filter((r) => r.status === "complete");
    const secs = done.map((r) => r.activeSeconds).filter((x): x is number => x !== null).sort((a, b) => a - b);
    const mid = secs.length ? (secs.length % 2 ? secs[(secs.length - 1) / 2] : Math.round((secs[secs.length / 2 - 1] + secs[secs.length / 2]) / 2)) : null;
    const now = mine.find((r) => !ENDED_STATUSES.includes(r.status as SessionStatus));
    return {
      id: p.id, name: p.name, checks30: mine.length, completed30: done.length, ftrPct: pct(done.filter(ftr).length, done.length), medianSeconds: mid,
      current: now ? live(now) : null, lastAt: mine[0]?.startedAt.toISOString() ?? null,
    };
  });
}

export interface Week {
  /** Monday of the week, YYYY-MM-DD. */
  start: string;
  completed: number;
  ftrPct: number | null;
}

export interface StepTime {
  step: number;
  name: string;
  sessions: number;
  /** Mean active time of the step in completed checks, seconds. */
  avgSeconds: number | null;
  targetSeconds: number | null;
}

export interface DeviationCount {
  step: number;
  kind: DeviationKind;
  count: number;
}

export const DEVIATION_LABEL: Record<DeviationKind, string> = { skipped: "skipped", wrong_order: "wrong order" };
export const isDeviationKind = (v: unknown): v is DeviationKind => v === "skipped" || v === "wrong_order";

/** The Analytics header filters: how many weeks back, and one station or all. */
export const PERIOD_WEEKS = [4, 8, 12] as const;
export interface AnalyticsFilter {
  weeks: number;
  station: string | null;
}

export function analyticsFilter(sp: Record<string, string | string[] | undefined>): AnalyticsFilter {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const w = Number(one(sp.weeks));
  const station = one(sp.station).trim().slice(0, 80);
  return { weeks: (PERIOD_WEEKS as readonly number[]).includes(w) ? w : 8, station: station && station !== "all" ? station : null };
}

export interface Analytics {
  weeks: Week[];
  steps: StepTime[];
  /** Top 5, most first. */
  deviations: DeviationCount[];
  byStation: { station: string; count: number }[];
  /** For the station filter. */
  stations: string[];
}

function mondayOf(now: Date): Date {
  const m = new Date(now);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Analytics, for the filter's weeks and station: first-time right per week, each step's average time against its
 * target, the most common deviations and discrepancies per station. Real sessions only.
 */
export async function analytics(f: AnalyticsFilter, now = new Date()): Promise<Analytics> {
  const { db } = await getRepo().conn();
  const monday = mondayOf(now);
  const from = new Date(monday.getTime() - (f.weeks - 1) * 7 * DAY);
  const where = and(real, gte(t.sessions.startedAt, from), f.station ? eq(stationExpr, f.station) : undefined);
  const [rows, devs, discs, stations, rev] = await Promise.all([
    db.select().from(t.sessions).where(and(where, eq(t.sessions.status, "complete"))).orderBy(desc(t.sessions.startedAt)).limit(3000),
    db
      .select({ step: t.stepEvents.step, kind: t.stepEvents.kind, count: count() })
      .from(t.stepEvents)
      .innerJoin(t.sessions, eq(t.sessions.id, t.stepEvents.sessionId))
      .where(and(where, inArray(t.stepEvents.kind, ["skipped", "wrong_order"])))
      .groupBy(t.stepEvents.step, t.stepEvents.kind),
    db
      .select({ station: stationExpr, count: count() })
      .from(t.discrepancies)
      .innerJoin(t.sessions, eq(t.sessions.id, t.discrepancies.sessionId))
      .where(where)
      .groupBy(stationExpr),
    getRepo().stations(),
    activeRevision(),
  ]);
  const weeks: Week[] = Array.from({ length: f.weeks }, (_, i) => {
    const start = new Date(monday.getTime() - (f.weeks - 1 - i) * 7 * DAY);
    const end = new Date(start.getTime() + 7 * DAY);
    const done = rows.filter((r) => r.startedAt >= start && r.startedAt < end);
    return { start: ymd(start), completed: done.length, ftrPct: pct(done.filter(ftr).length, done.length) };
  });
  const sums = STEPS.map(() => ({ n: 0, ms: 0 }));
  for (const s of await withActions(db, rows.slice(0, 300))) {
    const st = reduce(s.actions, s.startedAt);
    sums.forEach((x, i) => {
      const ms = stepActiveMs(st, i + 1);
      if (ms === null) return;
      x.n++;
      x.ms += ms;
    });
  }
  return {
    weeks,
    steps: STEPS.map((s, i) => ({
      step: s.n, name: s.name, sessions: sums[i].n, avgSeconds: sums[i].n ? Math.round(sums[i].ms / sums[i].n / 1000) : null, targetSeconds: rev.steps[i]?.targetCtSeconds ?? null,
    })),
    deviations: devs
      .filter((d): d is typeof d & { kind: DeviationKind } => isDeviationKind(d.kind))
      .map((d) => ({ step: d.step, kind: d.kind, count: Number(d.count) }))
      .sort((a, b) => b.count - a.count || a.step - b.step)
      .slice(0, 5),
    byStation: discs.map((d) => ({ station: d.station, count: Number(d.count) })).sort((a, b) => b.count - a.count || a.station.localeCompare(b.station)),
    stations,
  };
}

/**
 * Tasks filtered from Analytics. A step and a deviation kind: checks with that deviation on that step. A step alone:
 * checks where that step took longer than its target in the Active SOP. Returns the matching session ids.
 */
export async function sessionsMatching(step: number, kind: DeviationKind | null): Promise<Set<string>> {
  const { db } = await getRepo().conn();
  if (kind) {
    const rows = await db
      .selectDistinct({ id: t.stepEvents.sessionId })
      .from(t.stepEvents)
      .innerJoin(t.sessions, eq(t.sessions.id, t.stepEvents.sessionId))
      .where(and(real, eq(t.stepEvents.step, step), eq(t.stepEvents.kind, kind)));
    return new Set(rows.map((r) => r.id));
  }
  const [rows, rev] = await Promise.all([
    db.select().from(t.sessions).where(and(real, gte(t.sessions.stepsDone, step))).orderBy(desc(t.sessions.startedAt)).limit(300),
    activeRevision(),
  ]);
  const target = rev.steps[step - 1]?.targetCtSeconds ?? null;
  if (target === null) return new Set();
  const over = new Set<string>();
  for (const s of await withActions(db, rows)) {
    const ms = stepActiveMs(reduce(s.actions, s.startedAt), step);
    if (ms !== null && ms / 1000 > target) over.add(s.id);
  }
  return over;
}
