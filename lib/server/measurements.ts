// Recorded values for the dashboard: filters, sorting, paging and CSV. Values are shown as recorded,
// never judged: no tolerance, no pass or fail. "Voice-entered, not a validated record".
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import * as t from "@/db/schema";
import { getRepo } from "./repo";
import { sessionWhere, stationExpr, type DashFilter } from "./sqlparts";

export const SORTS = ["recorded", "technician", "station", "step", "point", "value", "source", "status"] as const;
export type Sort = (typeof SORTS)[number];
export const PAGE_SIZE = 50;

export interface MeasurementQuery {
  f: DashFilter;
  step: number | null;
  source: "voice" | "typed" | null;
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
    [r.recordedAt, r.technician, r.station, r.sessionId, r.step, r.point, r.value, r.unit, r.source, r.status, r.textHeard, r.source === "voice" ? "Voice-entered, not a validated record" : "Typed, not a validated record"]
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
    source: sp.source === "voice" || sp.source === "typed" ? (sp.source as "voice" | "typed") : null,
    sort,
    dir: sp.dir === "asc" ? ("asc" as const) : ("desc" as const),
    page: Math.max(1, Math.floor(Number(sp.page) || 1)),
  };
}
