// SQL pieces shared by the dashboard queries. Days and shifts are always worked out in the plant
// time zone from lib/config.ts (Postgres "AT TIME ZONE"), never in UTC.
import { and, eq, gte, sql, type SQL } from "drizzle-orm";
import type { AnyColumn } from "drizzle-orm";
import * as t from "@/db/schema";
import { PLANT_TIME_ZONE, SHIFTS, type ShiftId } from "@/lib/config";

export interface DashFilter {
  station: string;
  /** Sessions started on or after this. Null: all time. */
  since: Date | null;
  /** Only sessions that started in this shift. Null: all shifts. */
  shift: ShiftId | null;
  includeSample: boolean;
}

export const stationExpr = sql<string>`coalesce(${t.sessions.station}, btrim(${t.sessions.fixture}))`;

/** A timestamptz column as a plant-local timestamp. */
export function localTs(col: AnyColumn | SQL): SQL {
  return sql`(${col} at time zone ${PLANT_TIME_ZONE})`;
}

/** Plant-local day, "YYYY-MM-DD". */
export function dayExpr(col: AnyColumn | SQL): SQL<string> {
  return sql<string>`to_char(${localTs(col)}, 'YYYY-MM-DD')`;
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** 'A' | 'B' | 'C' for the plant-local time of a column, from the shifts in lib/config.ts. */
export function shiftExpr(col: AnyColumn | SQL): SQL<ShiftId> {
  const local = localTs(col);
  const mins = sql`(extract(hour from ${local})::int * 60 + extract(minute from ${local})::int)`;
  const cases = SHIFTS.map((s) => {
    const a = toMinutes(s.start);
    const b = toMinutes(s.end);
    const cond = a < b ? sql`${mins} >= ${sql.raw(String(a))} and ${mins} < ${sql.raw(String(b))}` : sql`${mins} >= ${sql.raw(String(a))} or ${mins} < ${sql.raw(String(b))}`;
    return sql`when ${cond} then ${sql.raw(`'${s.id}'`)}`;
  });
  return sql<ShiftId>`(case ${sql.join(cases, sql` `)} end)`;
}

const notSample = sql`coalesce(${t.sessions.isSample}, false) = false`;

/** Which sessions a dashboard view covers. `withShift: false` ignores the shift filter (block 2 compares shifts). */
export function sessionWhere(f: DashFilter, withShift = true): SQL | undefined {
  return and(
    eq(stationExpr, f.station),
    f.since ? gte(t.sessions.startedAt, f.since) : undefined,
    f.includeSample ? undefined : notSample,
    withShift && f.shift ? sql`${shiftExpr(t.sessions.startedAt)} = ${f.shift}` : undefined,
  );
}

export const DEVIATION_KINDS = ["skipped", "wrong_order", "cannot_do"] as const;
export const ON_HOLD = ["on_hold", "stopped"];
export const ENDED_WITHOUT = ["scrapped", "rework", "concession", "part_held"];
