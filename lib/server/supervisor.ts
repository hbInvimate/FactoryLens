// The Supervisor pages (/supervisor): read-only figures from real sessions. Sample data is left out, except the
// demo people's checks (npm run demo:seed), which only exist when someone seeded them on purpose.
// First-time right: a completed check with all 12 steps correct on the first attempt.
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import { isRightFirstTime, reduce, stepActiveMs } from "@/lib/check/reducer";
import { ON_HOLD_STATUSES, type DeviationKind, type SessionStatus } from "@/lib/check/types";
import { DEMO_EMAIL_DOMAIN, isDemoEmail } from "@/lib/sample/demoUsers";
import { STEPS } from "@/lib/sop";
import { percentile } from "@/lib/sop-stats";
import { getRepo } from "./repo";
import { activeRevision } from "./sop";
import { stationExpr } from "./sqlparts";
import { withActions } from "./sopData";

const DAY = 86_400_000;
const LIVE: SessionStatus[] = ["running", "paused", "on_hold", "stopped"];
/** Real sessions, and the demo people's sample checks. */
export const shown = sql`(coalesce(${t.sessions.isSample}, false) = false or ${t.sessions.userId} in (select ${t.users.id} from ${t.users} where ${t.users.email} like ${`%@${DEMO_EMAIL_DOMAIN}`}))`;

type Row = typeof t.sessions.$inferSelect;
const ftr = (r: Row) => r.status === "complete" && r.correctFirstTime >= 12;
const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : null);

async function recent(days: number): Promise<Row[]> {
  const { db } = await getRepo().conn();
  return db.select().from(t.sessions).where(and(shown, gte(t.sessions.startedAt, new Date(Date.now() - days * DAY)))).orderBy(desc(t.sessions.startedAt)).limit(3000);
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
    db.select().from(t.sessions).where(and(shown, inArray(t.sessions.status, LIVE))).orderBy(desc(t.sessions.startedAt)).limit(200),
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

/** Team: how far back. "This week" starts on Monday. */
export const TEAM_PERIODS = { week: "This week", "4w": "Last 4 weeks", "12w": "Last 12 weeks" } as const;
export type TeamPeriod = keyof typeof TEAM_PERIODS;
export const TEAM_SORTS = { ftr: "First-time right", checks: "Checks", deviations: "Deviations", time: "Avg check time", name: "Name" } as const;
export type TeamSort = keyof typeof TEAM_SORTS;

/** The whole check's target, 45:00. The time bar turns amber within 5% of it, or over it. */
export const CHECK_TARGET_SECONDS = 45 * 60;
export const nearTarget = (s: number | null) => s !== null && s >= CHECK_TARGET_SECONDS * 0.95;

export type TeamTag = "top" | "on_track" | "coach";
export const TEAM_TAG_LABEL: Record<TeamTag, string> = { top: "Top", on_track: "On track", coach: "Coach" };

/** Top: first-time right 95% or more. Coach: below 85%, or 4 or more deviations. Else On track. Null: nothing to judge yet. */
export function tagOf(ftrPct: number | null, deviations: number): TeamTag | null {
  if (deviations >= 4 || (ftrPct !== null && ftrPct < 85)) return "coach";
  if (ftrPct === null) return null;
  return ftrPct >= 95 ? "top" : "on_track";
}

export interface TeamMember {
  id: string;
  name: string;
  /** From npm run demo:seed. */
  demo: boolean;
  checks: number;
  completed: number;
  ftrPct: number | null;
  deviations: number;
  /** Mean check time of completed checks, seconds. */
  avgSeconds: number | null;
  /** Median check time of completed checks with a recorded time, seconds. */
  medianSeconds: number | null;
  tag: TeamTag | null;
  /** One line from their checks: the most common deviation, else the slowest step against its target. */
  note: string;
}

export interface Team {
  period: TeamPeriod;
  members: TeamMember[];
  totals: { ftrPct: number | null; checks: number; avgSeconds: number | null; medianSeconds: number | null; coach: number };
}

export function teamFilter(sp: Record<string, string | string[] | undefined>): { period: TeamPeriod; sort: TeamSort } {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const p = one(sp.period);
  const s = one(sp.sort);
  return { period: p in TEAM_PERIODS ? (p as TeamPeriod) : "week", sort: s in TEAM_SORTS ? (s as TeamSort) : "ftr" };
}

function periodStart(period: TeamPeriod, now: Date): Date {
  const m = new Date(now);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return period === "week" ? m : new Date(m.getTime() - (period === "4w" ? 3 : 11) * 7 * DAY);
}

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
const median = (xs: number[]) => (xs.length ? Math.round(percentile(xs, 0.5) as number) : null);
/** Check times of completed checks; checks with no recorded time are left out of averages. */
const timesOf = (rows: Row[]) => rows.filter((r) => r.status === "complete").map((r) => r.activeSeconds).filter((x): x is number => x !== null);

/** "112%", capped: a step's share of its target never shows above 999% ("999%+"). */
export const pctOfTarget = (ratio: number) => (ratio * 100 > 999 ? "999%+" : `${Math.round(ratio * 100)}%`);

/** Team: every Quality Technician who can sign in, with their checks in the period. Not sorted. */
export async function team(period: TeamPeriod, now = new Date()): Promise<Team> {
  const { db } = await getRepo().conn();
  const from = periodStart(period, now);
  const [people, rows, devs, rev] = await Promise.all([
    db.select({ id: t.users.id, name: t.users.name, email: t.users.email }).from(t.users).where(and(eq(t.users.role, "technician"), eq(t.users.disabled, false))).orderBy(t.users.name),
    db.select().from(t.sessions).where(and(shown, gte(t.sessions.startedAt, from))).orderBy(desc(t.sessions.startedAt)).limit(3000),
    db
      .select({ userId: t.sessions.userId, step: t.stepEvents.step, kind: t.stepEvents.kind, count: count() })
      .from(t.stepEvents)
      .innerJoin(t.sessions, eq(t.sessions.id, t.stepEvents.sessionId))
      .where(and(shown, gte(t.sessions.startedAt, from), inArray(t.stepEvents.kind, ["skipped", "wrong_order"])))
      .groupBy(t.sessions.userId, t.stepEvents.step, t.stepEvents.kind),
    activeRevision(),
  ]);
  // Step times, for the note of people without deviations: their completed checks (at most 40 each).
  const quiet = new Set(people.filter((p) => !devs.some((d) => d.userId === p.id)).map((p) => p.id));
  const timed = rows.filter((r) => r.status === "complete" && r.userId && quiet.has(r.userId));
  const perPerson = new Map<string, Row[]>();
  for (const r of timed) if ((perPerson.get(r.userId!)?.length ?? 0) < 40) perPerson.set(r.userId!, [...(perPerson.get(r.userId!) ?? []), r]);
  const stats = await withActions(db, [...perPerson.values()].flat());
  const stepSecs = new Map<string, number[][]>();
  for (const s of stats) {
    const st = reduce(s.actions, s.startedAt);
    const acc = stepSecs.get(s.userId!) ?? STEPS.map(() => []);
    acc.forEach((x, i) => {
      const ms = stepActiveMs(st, i + 1);
      if (ms !== null) x.push(ms / 1000);
    });
    stepSecs.set(s.userId!, acc);
  }

  const members = people.map((p): TeamMember => {
    const mine = rows.filter((r) => r.userId === p.id);
    const done = mine.filter((r) => r.status === "complete");
    const ftrPct = pct(done.filter(ftr).length, done.length);
    const deviations = mine.reduce((n, r) => n + r.deviations, 0);
    const avgSeconds = mean(timesOf(done));
    const medianSeconds = median(timesOf(done));
    let note = mine.length ? "No deviations" : `No checks ${TEAM_PERIODS[period].toLowerCase()}`;
    const top = devs.filter((d) => d.userId === p.id).sort((a, b) => Number(b.count) - Number(a.count) || a.step - b.step)[0];
    if (top && isDeviationKind(top.kind)) {
      note = `Top deviation: step ${top.step} ${DEVIATION_LABEL[top.kind]} (${Number(top.count)}×)`;
    } else if (stepSecs.has(p.id)) {
      // The step furthest over (or least under) its target in the Active SOP, by median.
      const worst = STEPS.map((s, i) => {
        const med = percentile(stepSecs.get(p.id)![i], 0.5);
        const target = rev.steps[i]?.targetCtSeconds ?? null;
        return { s, med, ratio: med !== null && target ? med / target : -1 };
      }).sort((a, b) => b.ratio - a.ratio)[0];
      if (worst.med !== null && worst.ratio > 0) note = `Slowest vs target: step ${worst.s.n} (${pctOfTarget(worst.ratio)} of target)`;
    }
    return { id: p.id, name: p.name, demo: isDemoEmail(p.email), checks: mine.length, completed: done.length, ftrPct, deviations, avgSeconds, medianSeconds, tag: tagOf(ftrPct, deviations), note };
  });
  const ids = new Set(people.map((p) => p.id));
  const theirs = rows.filter((r) => r.userId && ids.has(r.userId));
  const done = theirs.filter((r) => r.status === "complete");
  return {
    period,
    members,
    totals: {
      ftrPct: pct(done.filter(ftr).length, done.length),
      checks: theirs.length,
      avgSeconds: mean(timesOf(done)),
      medianSeconds: median(timesOf(done)),
      coach: members.filter((m) => m.tag === "coach").length,
    },
  };
}

export function sortTeam(members: TeamMember[], sort: TeamSort): TeamMember[] {
  const nullLast = (a: number | null, b: number | null, dir: 1 | -1) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : (a - b) * dir);
  const by: Record<TeamSort, (a: TeamMember, b: TeamMember) => number> = {
    ftr: (a, b) => nullLast(a.ftrPct, b.ftrPct, -1) || b.checks - a.checks,
    checks: (a, b) => b.checks - a.checks,
    deviations: (a, b) => b.deviations - a.deviations,
    time: (a, b) => nullLast(a.avgSeconds, b.avgSeconds, 1),
    name: () => 0,
  };
  return [...members].sort((a, b) => by[sort](a, b) || a.name.localeCompare(b.name));
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
  /** Median active time of the step in completed checks, seconds. */
  medianSeconds: number | null;
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
  /** Right first time over the completed checks; left checks are counted apart (not scored). */
  rft: { completed: number; right: number; redone: number; redoneSteps: number[]; left: number; runningRate: number[] };
  medianCycleSeconds: number | null;
  taktSeconds: number | null;
  /** Per step 1 to 12: deviations (skipped, wrong order) and their kinds. */
  deviationsByStep: { step: number; total: number; kinds: { kind: DeviationKind; count: number }[] }[];
  discrepancies: {
    total: number;
    open: number;
    cleared: number;
    byCategory: { category: string; count: number }[];
    openList: { id: string; sessionId: string; issue: string; category: string; station: string; loggedAt: string }[];
  };
}

function mondayOf(now: Date): Date {
  const m = new Date(now);
  m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * Analytics, for the filter's weeks and station: first-time right per week, each step's median time against its
 * target, the most common deviations and discrepancies per station. Real sessions only.
 */
export async function analytics(f: AnalyticsFilter, now = new Date()): Promise<Analytics> {
  const { db } = await getRepo().conn();
  const monday = mondayOf(now);
  const from = new Date(monday.getTime() - (f.weeks - 1) * 7 * DAY);
  const where = and(shown, gte(t.sessions.startedAt, from), f.station ? eq(stationExpr, f.station) : undefined);
  const [rows, devs, discs, stations, rev, leftRows, discRows] = await Promise.all([
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
    db.select({ n: count() }).from(t.sessions).where(and(where, eq(t.sessions.status, "left"))),
    db
      .select({ id: t.discrepancies.id, sessionId: t.discrepancies.sessionId, issue: t.discrepancies.issueLabel, category: t.discrepancies.category, status: t.discrepancies.status, loggedAt: t.discrepancies.loggedAt, station: stationExpr })
      .from(t.discrepancies)
      .innerJoin(t.sessions, eq(t.sessions.id, t.discrepancies.sessionId))
      .where(where)
      .orderBy(desc(t.discrepancies.loggedAt)),
  ]);
  const weeks: Week[] = Array.from({ length: f.weeks }, (_, i) => {
    const start = new Date(monday.getTime() - (f.weeks - 1 - i) * 7 * DAY);
    const end = new Date(start.getTime() + 7 * DAY);
    const done = rows.filter((r) => r.startedAt >= start && r.startedAt < end);
    return { start: ymd(start), completed: done.length, ftrPct: pct(done.filter(ftr).length, done.length) };
  });
  const secs: number[][] = STEPS.map(() => []);
  // Per completed check, oldest first: every step right first time, and the steps that were not.
  const checks: { right: boolean; missed: number[] }[] = [];
  for (const s of await withActions(db, rows.slice(0, 300))) {
    const st = reduce(s.actions, s.startedAt);
    secs.forEach((x, i) => {
      const ms = stepActiveMs(st, i + 1);
      if (ms !== null) x.push(ms / 1000);
    });
    const missed = STEPS.map((x) => x.n).filter((n) => !isRightFirstTime(st, n));
    checks.unshift({ right: missed.length === 0, missed });
  }
  const right = checks.filter((c) => c.right).length;
  const cycles = rows.map((r) => r.activeSeconds).filter((x): x is number => x !== null);
  const targets = STEPS.map((_, i) => rev.steps[i]?.targetCtSeconds ?? null);
  const kinds = devs.filter((d): d is typeof d & { kind: DeviationKind } => isDeviationKind(d.kind));
  const isOpen = (s: string) => s === "open" || s === "escalated";
  const cats = new Map<string, number>();
  for (const d of discRows) cats.set(d.category ?? "Other", (cats.get(d.category ?? "Other") ?? 0) + 1);
  return {
    rft: {
      completed: checks.length,
      right,
      redone: checks.length - right,
      redoneSteps: [...new Set(checks.flatMap((c) => c.missed))].sort((a, b) => a - b),
      left: Number(leftRows[0]?.n ?? 0),
      runningRate: checks.map((_, i) => Math.round((checks.slice(0, i + 1).filter((c) => c.right).length / (i + 1)) * 100)),
    },
    medianCycleSeconds: cycles.length ? Math.round(percentile(cycles, 0.5) as number) : null,
    taktSeconds: targets.every((x) => x !== null) ? targets.reduce((a, b) => a! + b!, 0) : null,
    deviationsByStep: STEPS.map((s) => {
      const k = kinds.filter((d) => d.step === s.n).map((d) => ({ kind: d.kind, count: Number(d.count) }));
      return { step: s.n, total: k.reduce((a, b) => a + b.count, 0), kinds: k.sort((a, b) => b.count - a.count) };
    }),
    discrepancies: {
      total: discRows.length,
      open: discRows.filter((d) => isOpen(d.status)).length,
      cleared: discRows.filter((d) => !isOpen(d.status)).length,
      byCategory: [...cats.entries()].map(([category, n]) => ({ category, count: n })).sort((a, b) => b.count - a.count),
      openList: discRows
        .filter((d) => isOpen(d.status))
        .map((d) => ({ id: d.id, sessionId: d.sessionId, issue: d.issue, category: d.category ?? "Other", station: d.station, loggedAt: d.loggedAt.toISOString() })),
    },
    weeks,
    steps: STEPS.map((s, i) => ({
      step: s.n, name: s.name, sessions: secs[i].length, medianSeconds: secs[i].length ? Math.round(percentile(secs[i], 0.5) as number) : null, targetSeconds: rev.steps[i]?.targetCtSeconds ?? null,
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
      .where(and(shown, eq(t.stepEvents.step, step), eq(t.stepEvents.kind, kind)));
    return new Set(rows.map((r) => r.id));
  }
  const [rows, rev] = await Promise.all([
    db.select().from(t.sessions).where(and(shown, gte(t.sessions.stepsDone, step))).orderBy(desc(t.sessions.startedAt)).limit(300),
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

// ---------- Home: the last 7 days ----------

export interface RecentCheck {
  id: string;
  finishedAt: string;
  technician: string;
  part: string;
  station: string;
  status: SessionStatus;
  cycleSeconds: number | null;
  conformance: number | null;
  deviations: number;
}

export interface HomeWeek {
  completed: number;
  /** Completed with every step right first time. */
  allRight: number;
  left: number;
  closed: number;
  /** Steps right first time / steps, over the completed checks. Null without one. */
  conformancePct: number | null;
  /** Per step: right first time in every completed check, or redone in at least one. Null: no completed checks. */
  stepLooks: ("right" | "redone")[] | null;
  /** Mean check time of completed checks, and per step the mean time against the step target. */
  avgCycleSeconds: number | null;
  stepTimes: { n: number; seconds: number | null; target: number | null }[];
  taktSeconds: number | null;
  recent: RecentCheck[];
  /** Assigned tasks not started yet, and the oldest one's creation time. */
  notStarted: { count: number; oldest: string | null };
}

const CLOSED: SessionStatus[] = ["scrapped", "rework", "concession", "part_held"];

export async function homeWeek(): Promise<HomeWeek> {
  const { db } = await getRepo().conn();
  const [rows, rev, open] = await Promise.all([
    recent(7),
    activeRevision(),
    db.select({ createdAt: t.tasks.createdAt }).from(t.tasks).where(sql`${t.tasks.sessionId} is null`).orderBy(t.tasks.createdAt),
  ]);
  const done = rows.filter((r) => r.status === "complete");
  const states = (await withActions(db, done.slice(0, 300))).map((s) => reduce(s.actions, s.startedAt));
  const steps = STEPS.map((s) => s.n);
  const rft = states.map((st) => steps.map((n) => isRightFirstTime(st, n)));
  const rightSteps = rft.flat().filter(Boolean).length;
  const times = steps.map((n) => states.map((st) => stepActiveMs(st, n)).filter((x): x is number => x !== null).map((ms) => ms / 1000));
  const targets = steps.map((n) => rev.steps[n - 1]?.targetCtSeconds ?? null);
  const cycles = done.map((r) => r.activeSeconds).filter((x): x is number => x !== null);
  return {
    completed: done.length,
    allRight: done.filter(ftr).length,
    left: rows.filter((r) => r.status === "left").length,
    closed: rows.filter((r) => CLOSED.includes(r.status as SessionStatus)).length,
    conformancePct: rft.length ? Math.round((rightSteps / (rft.length * 12)) * 100) : null,
    stepLooks: rft.length ? steps.map((n) => (rft.every((x) => x[n - 1]) ? "right" : "redone")) : null,
    avgCycleSeconds: cycles.length ? Math.round(cycles.reduce((a, b) => a + b, 0) / cycles.length) : null,
    stepTimes: steps.map((n) => ({ n, seconds: times[n - 1].length ? times[n - 1].reduce((a, b) => a + b, 0) / times[n - 1].length : null, target: targets[n - 1] })),
    taktSeconds: targets.every((x) => x !== null) ? targets.reduce((a, b) => a! + b!, 0) : null,
    recent: done
      .map((r) => ({ r, end: r.endedAt ?? r.updatedAt }))
      .sort((a, b) => b.end.getTime() - a.end.getTime())
      .slice(0, 10)
      .map(({ r, end }) => ({
        id: r.id, finishedAt: end.toISOString(), technician: r.operatorLabel, part: r.part, station: r.station ?? r.fixture, status: r.status as SessionStatus,
        cycleSeconds: r.activeSeconds, conformance: r.conformance, deviations: r.deviations,
      })),
    notStarted: { count: open.length, oldest: open[0]?.createdAt.toISOString() ?? null },
  };
}
