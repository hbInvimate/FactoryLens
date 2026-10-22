// The Supervisor pages (/supervisor): read-only figures from real sessions (never sample data).
// First-time right: a completed check with all 12 steps correct on the first attempt.
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import { ENDED_STATUSES, ON_HOLD_STATUSES, type SessionStatus } from "@/lib/check/types";
import { stepStats } from "@/lib/sop-stats";
import { STEPS } from "@/lib/sop";
import { getRepo } from "./repo";
import { activeRevision } from "./sop";
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
  medianSeconds: number | null;
  targetSeconds: number | null;
}

/** Analytics: first-time right per week (last 8 weeks) and each step's median time against its target (last 30 days). */
export async function analytics(now = new Date()): Promise<{ weeks: Week[]; steps: StepTime[] }> {
  const rows = await recent(56);
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const weeks: Week[] = Array.from({ length: 8 }, (_, i) => {
    const from = new Date(monday.getTime() - (7 - i) * 7 * DAY);
    const to = new Date(from.getTime() + 7 * DAY);
    const done = rows.filter((r) => r.status === "complete" && r.startedAt >= from && r.startedAt < to);
    const y = from.getFullYear(), m = String(from.getMonth() + 1).padStart(2, "0"), d = String(from.getDate()).padStart(2, "0");
    return { start: `${y}-${m}-${d}`, completed: done.length, ftrPct: pct(done.filter(ftr).length, done.length) };
  });
  const { db } = await getRepo().conn();
  const recentDone = rows.filter((r) => r.status === "complete" && r.startedAt.getTime() > now.getTime() - 30 * DAY).slice(0, 300);
  const [stats, rev] = await Promise.all([withActions(db, recentDone).then(stepStats), activeRevision()]);
  return {
    weeks,
    steps: STEPS.map((s, i) => ({ step: s.n, name: s.name, sessions: stats[i]?.sessions ?? 0, medianSeconds: stats[i]?.medianSeconds ?? null, targetSeconds: rev.steps[i]?.targetCtSeconds ?? null })),
  };
}
