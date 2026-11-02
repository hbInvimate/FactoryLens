// The control chart on /dashboard/measurements and its PDF export: how many readings, and the numbers under the chart.
// Pure, so the browser chart and the server PDF compute the same values.
import { toleranceOf } from "@/lib/measure-judge";

export const READINGS = ["7", "25", "50", "100", "all"] as const;
export type Readings = (typeof READINGS)[number];
export const DEFAULT_READINGS: Readings = "25";

export function parseReadings(v: unknown): Readings {
  return (READINGS as readonly unknown[]).includes(v) ? (v as Readings) : DEFAULT_READINGS;
}

/** The newest readings of a series (oldest first), as many as picked. */
export function lastReadings<T>(series: T[], n: Readings): T[] {
  return n === "all" ? series : series.slice(-Number(n));
}

export interface ChartStats {
  n: number;
  mean: number | null;
  min: number | null;
  max: number | null;
  /** Process capability against the point's SOP tolerance. Null with fewer than 2 readings, no spread or no tolerance. */
  cpk: number | null;
}

export function chartStats(point: string, values: number[]): ChartStats {
  const n = values.length;
  if (!n) return { n, mean: null, min: null, max: null, cpk: null };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1)) : 0;
  const t = toleranceOf(point);
  const cpk = t && sd > 0 ? Math.min(t.nominal + t.tol - mean, mean - (t.nominal - t.tol)) / (3 * sd) : null;
  return { n, mean, min: Math.min(...values), max: Math.max(...values), cpk };
}

export const fmt3 = (v: number | null) => (v === null ? "—" : v.toFixed(3));
export const fmtCpk = (v: number | null) => (v === null ? "—" : v.toFixed(2));

/** measurements_<station>_<point>_<date>, safe as a file name. */
export function exportName(station: string, point: string, date: string): string {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `measurements_${safe(station)}_${safe(point)}_${date}`;
}
