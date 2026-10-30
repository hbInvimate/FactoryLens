// Recorded values for the dashboard: filters, sorting, paging and CSV. Values are shown as recorded,
// never judged: no tolerance, no pass or fail. "Voice-entered, not a validated record".
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import * as t from "@/db/schema";
import { MEASUREMENT_UNIT } from "@/lib/config";
import { getRepo } from "./repo";
import { sessionWhere, stationExpr, type DashFilter } from "./sqlparts";

/** Where a value came from. demo: invented by "Fill demo values", never a measurement. */
export type Source = "voice" | "typed" | "demo";
export const SOURCE_NOTE: Record<string, string> = {
  voice: "Voice-entered, not a validated record",
  typed: "Typed, not a validated record",
  demo: "Demo value, not a measurement",
};

export const SORTS = ["recorded", "technician", "station", "step", "point", "value", "source", "status"] as const;
export type Sort = (typeof SORTS)[number];
export const PAGE_SIZE = 50;

export interface MeasurementQuery {
  f: DashFilter;
  step: number | null;
  source: Source | null;
  sort: Sort;
  dir: "asc" | "desc";
  page: number;
}

export interface MeasurementView {
  id: string;
  sessionId: string;
  recordedAt: string;
  technician: string;
  station: string;
  step: number;
  point: string;
  value: number | null;
  unit: string;
  source: string;
  status: string;
  textHeard: string;
}

const COL: Record<Sort, SQL> = {
  recorded: sql`${t.measurements.recordedAt}`,
  technician: sql`${t.sessions.operatorLabel}`,
  station: sql`${stationExpr}`,
  step: sql`${t.measurements.step}`,
  point: sql`${t.measurements.pointId}`,
  value: sql`${t.measurements.value}`,
  source: sql`${t.measurements.source}`,
  status: sql`${t.measurements.status}`,
};

function where(q: Omit<MeasurementQuery, "sort" | "dir" | "page">) {
  return and(sessionWhere(q.f), q.step ? eq(t.measurements.step, q.step) : undefined, q.source ? eq(t.measurements.source, q.source) : undefined);
}

const fields = {
  id: t.measurements.id,
  sessionId: t.measurements.sessionId,
  recordedAt: t.measurements.recordedAt,
  technician: t.sessions.operatorLabel,
  station: stationExpr,
  step: t.measurements.step,
  point: t.measurements.pointId,
  value: t.measurements.value,
  unit: t.measurements.unit,
  source: t.measurements.source,
  status: t.measurements.status,
  textHeard: t.measurements.textHeard,
};

type Row = { [K in keyof typeof fields]: unknown };
const view = (r: Row): MeasurementView => ({
  id: r.id as string, sessionId: r.sessionId as string, recordedAt: (r.recordedAt as Date).toISOString(), technician: r.technician as string,
  station: r.station as string, step: r.step as number, point: r.point as string, value: r.value as number | null, unit: r.unit as string,
  source: r.source as string, status: r.status as string, textHeard: r.textHeard as string,
});

export async function listMeasurements(q: MeasurementQuery): Promise<{ rows: MeasurementView[]; total: number }> {
  const { db } = await getRepo().conn();
  const w = where(q);
  const order = q.dir === "asc" ? asc(COL[q.sort]) : desc(COL[q.sort]);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t.measurements).innerJoin(t.sessions, eq(t.sessions.id, t.measurements.sessionId)).where(w);
  const rows = await db
    .select(fields)
    .from(t.measurements)
    .innerJoin(t.sessions, eq(t.sessions.id, t.measurements.sessionId))
    .where(w)
    .orderBy(order, desc(t.measurements.recordedAt), asc(t.measurements.id))
    .limit(PAGE_SIZE)
    .offset((Math.max(1, q.page) - 1) * PAGE_SIZE);
  return { rows: rows.map(view), total: Number(n) };
}

/** Every row in the view, for the CSV (at most 20,000). */
export async function allMeasurements(q: Omit<MeasurementQuery, "page">): Promise<MeasurementView[]> {
  const { db } = await getRepo().conn();
  const rows = await db
    .select(fields)
    .from(t.measurements)
    .innerJoin(t.sessions, eq(t.sessions.id, t.measurements.sessionId))
    .where(where(q))
    .orderBy(q.dir === "asc" ? asc(COL[q.sort]) : desc(COL[q.sort]), desc(t.measurements.recordedAt))
    .limit(20_000);
  return rows.map(view);
}

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows: MeasurementView[]): string {
  const head = ["recorded_at", "technician", "station", "session", "step", "point", "value", "unit", "source", "status", "text_heard", "note"];
  const lines = rows.map((r) =>
    [r.recordedAt, r.technician, r.station, r.sessionId, r.step, r.point, r.value, r.unit, r.source === "demo" ? "Demo" : r.source, r.status, r.textHeard, SOURCE_NOTE[r.source] ?? ""]
      .map(cell)
      .join(","),
  );
  return [head.join(","), ...lines].join("\r\n") + "\r\n";
}

/** The filters from a URL (station, range, shift come from dashView). */
export function parseMeasurementParams(sp: Record<string, string | string[] | undefined>) {
  const step = Number(sp.step);
  const sort = SORTS.includes(sp.sort as Sort) ? (sp.sort as Sort) : "recorded";
  return {
    step: [7, 8, 9, 10].includes(step) ? step : null,
    source: sp.source === "voice" || sp.source === "typed" || sp.source === "demo" ? (sp.source as Source) : null,
    sort,
    dir: sp.dir === "asc" ? ("asc" as const) : ("desc" as const),
    page: Math.max(1, Math.floor(Number(sp.page) || 1)),
  };
}

// ---------- "All values in a line": one row per check ----------

/** The 40 measured points in column order, grouped as on the fixture. */
export const FEATURE_GROUPS = [
  { label: "Holes", points: Array.from({ length: 14 }, (_, i) => `H${i + 1}`) },
  { label: "Slots", points: ["S1", "S2", "S3", "S4"] },
  { label: "Notches", points: ["N1", "N2", "N3", "N4"] },
  { label: "Trim edges", points: Array.from({ length: 14 }, (_, i) => `T${i + 1}`) },
  { label: "Flange gaps", points: ["F1", "F2", "F3", "F4"] },
];
export const FEATURE_POINTS = FEATURE_GROUPS.flatMap((g) => g.points);
/** Above this many checks the line view asks to narrow the date range. */
export const WIDE_LIMIT = 1000;

export interface WideCell {
  latest: number;
  /** Earlier values of a corrected point, oldest first. Empty when not corrected. */
  earlier: number[];
  /** The latest value came from "Fill demo values". */
  demo: boolean;
  /** When the latest value was recorded (ISO). */
  at: string;
}

export interface WideRow {
  sessionId: string;
  startedAt: string;
  technician: string;
  station: string;
  /** The check status (complete, left, ...). */
  status: string;
  /** A demo (sample) session: its values carry a "D". */
  demo: boolean;
  cells: Record<string, WideCell>;
}

/**
 * One grouped query: per check and point, the latest recorded value and the earlier ones. Only checks with at
 * least one recorded value in the filters get a row. Sample (demo) checks are included and marked.
 */
export async function wideMeasurements(f: DashFilter, source: Source | null): Promise<{ count: number; rows: WideRow[] | null }> {
  const { db } = await getRepo().conn();
  const w = and(
    sessionWhere({ ...f, includeSample: true }),
    eq(t.measurements.status, "recorded"),
    sql`${t.measurements.value} is not null`,
    source ? eq(t.measurements.source, source) : undefined,
  );
  const [{ n }] = await db
    .select({ n: sql<number>`count(distinct ${t.measurements.sessionId})::int` })
    .from(t.measurements)
    .innerJoin(t.sessions, eq(t.sessions.id, t.measurements.sessionId))
    .where(w);
  const count = Number(n);
  if (count > WIDE_LIMIT) return { count, rows: null };
  const grouped = await db
    .select({
      sessionId: t.measurements.sessionId,
      point: t.measurements.pointId,
      values: sql<number[]>`array_agg(${t.measurements.value} order by ${t.measurements.recordedAt}, ${t.measurements.id})`,
      sources: sql<string[]>`array_agg(${t.measurements.source} order by ${t.measurements.recordedAt}, ${t.measurements.id})`,
      // Milliseconds: the same on Neon and PGlite (a timestamp array comes back as text there).
      times: sql<number[]>`array_agg((extract(epoch from ${t.measurements.recordedAt}) * 1000)::float8 order by ${t.measurements.recordedAt}, ${t.measurements.id})`,
      status: t.sessions.status,
      startedAt: t.sessions.startedAt,
      technician: t.sessions.operatorLabel,
      station: sql<string>`${stationExpr}`,
      demo: sql<boolean>`coalesce(${t.sessions.isSample}, false)`,
    })
    .from(t.measurements)
    .innerJoin(t.sessions, eq(t.sessions.id, t.measurements.sessionId))
    .where(w)
    .groupBy(t.measurements.sessionId, t.measurements.pointId, t.sessions.startedAt, t.sessions.operatorLabel, stationExpr, t.sessions.isSample, t.sessions.status);
  const bySession = new Map<string, WideRow>();
  for (const g of grouped) {
    let row = bySession.get(g.sessionId);
    if (!row) {
      row = { sessionId: g.sessionId, startedAt: new Date(g.startedAt).toISOString(), technician: g.technician, station: g.station, status: g.status, demo: g.demo === true, cells: {} };
      bySession.set(g.sessionId, row);
    }
    const vals = (g.values ?? []).map(Number);
    const sources = g.sources ?? [];
    const times = g.times ?? [];
    if (vals.length) row.cells[g.point] = { latest: vals[vals.length - 1], earlier: vals.slice(0, -1), demo: sources[sources.length - 1] === "demo", at: new Date(Number(times[times.length - 1])).toISOString() };
  }
  const rows = [...bySession.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt) || a.sessionId.localeCompare(b.sessionId));
  return { count, rows };
}

/** The line view as CSV: one row per check, the latest value per point, the note on every row. */
export function toWideCsv(rows: WideRow[]): string {
  const head = ["started_at", "technician", "station", "session", ...FEATURE_POINTS.map((p) => `${p}_${MEASUREMENT_UNIT}`), "corrected_points", "demo", "note"];
  const lines = rows.map((r) =>
    [
      r.startedAt, r.technician, r.station, r.sessionId,
      // "D" marks a demo value: from a demo (sample) check, or from "Fill demo values".
      ...FEATURE_POINTS.map((p) => (r.cells[p] ? `${r.cells[p].latest}${r.demo || r.cells[p].demo ? "D" : ""}` : "")),
      FEATURE_POINTS.filter((p) => (r.cells[p]?.earlier.length ?? 0) > 0).join(" "),
      r.demo ? "yes" : "no",
      FEATURE_POINTS.some((p) => r.cells[p]?.demo) ? "Includes demo values, not measurements" : "Voice-entered or typed, not a validated record",
    ]
      .map(cell)
      .join(","),
  );
  return [head.join(","), ...lines].join("\r\n") + "\r\n";
}
