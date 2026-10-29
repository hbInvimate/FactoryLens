// The numbers on /dashboard, as database aggregates (group by). Nothing here loads every session.
// Only complete sessions are scored or timed. Days and shifts use the plant time zone (lib/config.ts).
import { sql, type SQL } from "drizzle-orm";
import type { Conn } from "@/db/client";
import * as t from "@/db/schema";
import { SHIFTS, type ShiftId } from "@/lib/config";
import { categoryOf, CATEGORIES } from "@/lib/issues";
import { step as sopStep } from "@/lib/sop";
import {
  dayExpr, DEVIATION_KINDS, ENDED_WITHOUT, ON_HOLD, sessionWhere, shiftExpr, type DashFilter,
} from "./sqlparts";

type Row = Record<string, unknown>;

async function rows(conn: Conn, q: SQL): Promise<Row[]> {
  const res = (await conn.db.execute(q)) as unknown as { rows?: Row[] } | Row[];
  return Array.isArray(res) ? res : (res.rows ?? []);
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const int = (v: unknown): number => Number(v ?? 0);
const list = (xs: readonly string[]) => sql.join(xs.map((x) => sql`${x}`), sql`, `);

const S = t.sessions;
const COMPLETE = sql`${S.status} = 'complete'`;

// ---------- tiles ----------

export interface Summary {
  total: number;
  complete: number;
  onHold: number;
  endedWithoutCheck: number;
  left: number;
  inProgress: number;
  /** Average conformance of complete sessions, percent. Null: not recorded. */
  conformance: number | null;
  scored: number;
  noDeviation: number;
  /** Average check time of complete sessions with a recorded time, seconds. */
  avgCheckSeconds: number | null;
  /** Median of the same check times. */
  medianCheckSeconds: number | null;
  timed: number;
  /** Complete sessions without a recorded check time (left out of the average). */
  untimed: number;
  openDiscrepancies: number;
  oldestHold: Date | null;
  real: number;
  sample: number;
}

export async function summary(conn: Conn, f: DashFilter): Promise<Summary> {
  const [a] = await rows(conn, sql`
    select
      count(*)::int as total,
      count(*) filter (where ${COMPLETE})::int as complete,
      count(*) filter (where ${S.status} in (${list(ON_HOLD)}))::int as on_hold,
      count(*) filter (where ${S.status} in (${list(ENDED_WITHOUT)}))::int as ended,
      count(*) filter (where ${S.status} = 'left')::int as left_n,
      count(*) filter (where ${S.status} in ('running', 'paused'))::int as in_progress,
      count(*) filter (where ${COMPLETE} and ${S.conformance} is not null)::int as scored,
      avg(${S.conformance}) filter (where ${COMPLETE})::float8 as conf,
      count(*) filter (where ${COMPLETE} and ${S.conformance} is not null and ${S.deviations} = 0)::int as no_dev,
      avg(${S.activeSeconds}) filter (where ${COMPLETE})::float8 as avg_time,
      percentile_cont(0.5) within group (order by ${S.activeSeconds}) filter (where ${COMPLETE})::float8 as median_time,
      count(*) filter (where ${COMPLETE} and ${S.activeSeconds} is not null)::int as timed,
      count(*) filter (where ${COMPLETE} and ${S.activeSeconds} is null)::int as untimed,
      count(*) filter (where coalesce(${S.isSample}, false))::int as sample,
      count(*) filter (where not coalesce(${S.isSample}, false))::int as real
    from ${S} where ${sessionWhere(f)}`);
  const [b] = await rows(conn, sql`
    select count(*)::int as open_n,
      min(${t.discrepancies.loggedAt}) filter (where ${S.status} in (${list(ON_HOLD)})) as oldest
    from ${t.discrepancies} join ${S} on ${S.id} = ${t.discrepancies.sessionId}
    where ${sessionWhere(f)} and ${t.discrepancies.status} in ('open', 'escalated')`);
  const conf = num(a?.conf);
  const avgTime = num(a?.avg_time);
  const medianTime = num(a?.median_time);
  return {
    total: int(a?.total),
    complete: int(a?.complete),
    onHold: int(a?.on_hold),
    endedWithoutCheck: int(a?.ended),
    left: int(a?.left_n),
    inProgress: int(a?.in_progress),
    conformance: conf === null ? null : Math.round(conf),
    scored: int(a?.scored),
    noDeviation: int(a?.no_dev),
    avgCheckSeconds: avgTime === null ? null : Math.round(avgTime),
    medianCheckSeconds: medianTime === null ? null : Math.round(medianTime),
    timed: int(a?.timed),
    untimed: int(a?.untimed),
    openDiscrepancies: int(b?.open_n),
    oldestHold: b?.oldest ? new Date(b.oldest as string) : null,
    real: int(a?.real),
    sample: int(a?.sample),
  };
}

// ---------- 1. conformance per day ----------

export interface DayBar {
  day: string;
  conformance: number;
  count: number;
}

export interface ConformanceByDay {
  days: DayBar[];
  /** Average of session conformance over the range. Null: no complete sessions. */
  overall: number | null;
  count: number;
}

export async function conformanceByDay(conn: Conn, f: DashFilter): Promise<ConformanceByDay> {
  const day = dayExpr(S.startedAt);
  const r = await rows(conn, sql`
    select ${day} as day, avg(${S.conformance})::float8 as conf, count(*)::int as n
    from ${S} where ${sessionWhere(f)} and ${COMPLETE} and ${S.conformance} is not null
    group by 1 order by 1`);
  const [o] = await rows(conn, sql`
    select avg(${S.conformance})::float8 as conf, count(*)::int as n
    from ${S} where ${sessionWhere(f)} and ${COMPLETE} and ${S.conformance} is not null`);
  const overall = num(o?.conf);
  return {
    days: r.map((x) => ({ day: String(x.day), conformance: Math.round(Number(x.conf)), count: int(x.n) })),
    overall: overall === null ? null : Math.round(overall),
    count: int(o?.n),
  };
}

// ---------- 2. check time by shift ----------

export interface ShiftTime {
  shift: ShiftId;
  /** Seconds. Null: not recorded (no complete session with a time in this shift). */
  average: number | null;
  median: number | null;
  count: number;
  untimed: number;
}

/** Always all three shifts, so they can be compared; the shift filter only dims the others. */
export async function checkTimeByShift(conn: Conn, f: DashFilter): Promise<ShiftTime[]> {
  const shift = shiftExpr(S.startedAt);
  const r = await rows(conn, sql`
    select ${shift} as shift,
      avg(${S.activeSeconds})::float8 as avg_s,
      percentile_cont(0.5) within group (order by ${S.activeSeconds})::float8 as median_s,
      count(${S.activeSeconds})::int as n,
      count(*) filter (where ${S.activeSeconds} is null)::int as untimed
    from ${S} where ${sessionWhere(f, false)} and ${COMPLETE}
    group by 1`);
  return SHIFTS.map((s) => {
    const x = r.find((y) => y.shift === s.id);
    const n = int(x?.n);
    return {
      shift: s.id,
      average: n ? Math.round(Number(x!.avg_s)) : null,
      median: n ? Math.round(Number(x!.median_s)) : null,
      count: n,
      untimed: int(x?.untimed),
    };
  });
}

// ---------- 3. steps that cause most deviations ----------

export interface StepDeviations {
  step: number;
  /** Deviations at this step: one per session and kind (skipped, wrong order, cannot do). */
  count: number;
  /** "H9 not checked", "C4 before C3", "Stopped: Crack seen in the part". */
  items: { label: string; count: number; kind: "point" | "order" | "cannot" }[];
  /** Sessions whose missed points were not recorded. */
  notRecorded: number;
}

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export async function deviationsByStep(conn: Conn, f: DashFilter, top = 5): Promise<StepDeviations[]> {
  const E = t.stepEvents;
  const base = sql`from ${E} join ${S} on ${S.id} = ${E.sessionId} where ${sessionWhere(f)}`;
  const steps = await rows(conn, sql`
    select ${E.step} as step, count(distinct ${E.sessionId} || ':' || ${E.kind})::int as n
    ${base} and ${E.kind} in (${list(DEVIATION_KINDS)})
    group by 1 order by 2 desc, 1 asc limit ${top}`);
  if (!steps.length) return [];
  const ids = steps.map((s) => int(s.step));
  const inSteps = sql`${E.step} in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`;

  const [points, orders, unknown, cannot] = await Promise.all([
    rows(conn, sql`
      select ${E.step} as step, p.point as label, count(*)::int as n
      from ${E} join ${S} on ${S.id} = ${E.sessionId}
      cross join lateral jsonb_array_elements_text(${E.points}) as p(point)
      where ${sessionWhere(f)} and ${E.kind} = 'skipped' and ${E.points} is not null and ${inSteps}
      group by 1, 2`),
    rows(conn, sql`
      select ${E.step} as step, (${E.points}->>0) || ' before ' || (${E.points}->>1) as label,
        count(distinct ${E.sessionId})::int as n
      ${base} and ${E.kind} = 'wrong_order' and jsonb_array_length(coalesce(${E.points}, '[]'::jsonb)) = 2 and ${inSteps}
      group by 1, 2`),
    rows(conn, sql`
      select ${E.step} as step, count(distinct ${E.sessionId})::int as n
      ${base} and ${E.kind} in ('skipped', 'wrong_order')
        and jsonb_array_length(coalesce(${E.points}, '[]'::jsonb)) = 0 and ${inSteps}
      group by 1`),
    rows(conn, sql`
      select ${E.step} as step, ${E.detail} as label, count(distinct ${E.sessionId})::int as n
      ${base} and ${E.kind} = 'cannot_do' and ${inSteps}
      group by 1, 2`),
  ]);

  return steps.map((s) => {
    const n = int(s.step);
    const verb = sopStep(n).ordered ? "not closed" : "not checked";
    const items = [
      ...points.filter((p) => int(p.step) === n).map((p) => ({ label: `${p.label} ${verb}`, count: int(p.n), kind: "point" as const, key: String(p.label) })),
      ...orders.filter((p) => int(p.step) === n).map((p) => ({ label: String(p.label), count: int(p.n), kind: "order" as const, key: String(p.label) })),
      ...cannot.filter((p) => int(p.step) === n).map((p) => ({ label: String(p.label || "Cannot do"), count: int(p.n), kind: "cannot" as const, key: String(p.label) })),
    ]
      .sort((a, b) => b.count - a.count || natural(a.key, b.key))
      .map(({ label, count, kind }) => ({ label, count, kind }));
    return { step: n, count: int(s.n), items, notRecorded: int(unknown.find((u) => int(u.step) === n)?.n) };
  });
}

// ---------- 4. lodged discrepancies by category and shift ----------

export type ShiftCounts = Record<ShiftId, number> & { total: number };

export interface CategoryTable {
  rows: ({ category: string } & ShiftCounts)[];
  totals: ShiftCounts;
  fixedOnSpot: ShiftCounts;
}

const zero = (): ShiftCounts => ({ A: 0, B: 0, C: 0, total: 0 });

/** Each discrepancy counts in the shift in which it was LODGED (its own time), not the session's shift. */
export async function discrepanciesByCategory(conn: Conn, f: DashFilter): Promise<CategoryTable> {
  const D = t.discrepancies;
  const r = await rows(conn, sql`
    select ${D.category} as category, ${D.step} as step, ${D.issueLabel} as issue,
      ${shiftExpr(D.loggedAt)} as shift, (${D.status} = 'fixed_on_spot') as fixed, count(*)::int as n
    from ${D} join ${S} on ${S.id} = ${D.sessionId}
    where ${sessionWhere(f, false)}
    group by 1, 2, 3, 4, 5`);
  const byCat = new Map<string, ShiftCounts>(CATEGORIES.map((c) => [c, zero()]));
  const totals = zero();
  const fixedOnSpot = zero();
  for (const x of r) {
    const shift = x.shift as ShiftId;
    const n = int(x.n);
    if (x.fixed === true || x.fixed === "t") {
      fixedOnSpot[shift] += n;
      fixedOnSpot.total += n;
      continue;
    }
    const cat = (x.category as string | null) ?? categoryOf(int(x.step), String(x.issue));
    const c = byCat.get(cat) ?? byCat.get("Other")!;
    c[shift] += n;
    c.total += n;
    totals[shift] += n;
    totals.total += n;
  }
  return { rows: CATEGORIES.map((category) => ({ category, ...byCat.get(category)! })), totals, fixedOnSpot };
}
