// The dashboard's filters live in the URL, so a view can be shared and survives a reload.
import type { ShiftId } from "@/lib/config";
import type { Range } from "./metrics";

export interface DashParams {
  station: string;
  range: Range;
  shift: ShiftId | null;
  sample: boolean;
  /** Sessions table: only sessions with a deviation at this step. */
  dev: number | null;
}

export function parseShift(v: unknown): ShiftId | null {
  return v === "A" || v === "B" || v === "C" ? v : null;
}

export function parseDev(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : null;
}

export function dashHref(p: DashParams, change: Partial<DashParams> = {}): string {
  const q = { ...p, ...change };
  const s = new URLSearchParams({ station: q.station, range: q.range, shift: q.shift ?? "all", sample: q.sample ? "1" : "0" });
  if (q.dev) s.set("dev", String(q.dev));
  return `/dashboard?${s.toString()}`;
}
