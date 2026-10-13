// The numbers on /dashboard. Read-only, from saved sessions.
// Conformance of a session = steps correct on the first attempt / 12 (stored per session).
// Part-held and left sessions are not scored and are left out of every average.
import type { SessionStatus } from "@/lib/check/types";

export interface DashSession {
  status: SessionStatus;
  /** Null when not scored: not finished, part held, or left. */
  conformance: number | null;
  deviations: number;
  /** Check time in seconds. Null when not recorded. */
  activeSeconds: number | null;
  openDiscrepancies: number;
}

export type Range = "7" | "30" | "90" | "all";
export const RANGES: { id: Range; label: string }[] = [
  { id: "7", label: "Last 7 days" },
  { id: "30", label: "Last 30 days" },
  { id: "90", label: "Last 90 days" },
  { id: "all", label: "All time" },
];

export function parseRange(v: unknown): Range {
  return RANGES.some((r) => r.id === v) ? (v as Range) : "30";
}

/** Start of the range, counted back from now. Null for all time. */
export function rangeStart(range: Range, now: number = Date.now()): Date | null {
  return range === "all" ? null : new Date(now - Number(range) * 86_400_000);
}

/** A completed, scored session: all 12 steps done and not part held or left. */
export function isScored(s: DashSession): boolean {
  return s.conformance !== null && s.status !== "part_held" && s.status !== "left";
}

export interface Summary {
  total: number;
  complete: number;
  partHeld: number;
  left: number;
  inProgress: number;
  scored: number;
  /** Average conformance, percent. Null: not recorded (no completed sessions). */
  conformance: number | null;
  noDeviation: number;
  /** Share of completed sessions with no deviation, percent. */
  noDeviationShare: number | null;
  /** Average check time in seconds over completed sessions with a recorded time. */
  avgCheckSeconds: number | null;
  timed: number;
  openDiscrepancies: number;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function summarise(rows: DashSession[]): Summary {
  const scored = rows.filter(isScored);
  const timed = scored.map((r) => r.activeSeconds).filter((x): x is number => x !== null);
  const noDev = scored.filter((r) => r.deviations === 0).length;
  const conf = avg(scored.map((r) => r.conformance!));
  const time = avg(timed);
  const partHeld = rows.filter((r) => r.status === "part_held").length;
  const left = rows.filter((r) => r.status === "left").length;
  return {
    total: rows.length,
    complete: scored.length,
    partHeld,
    left,
    inProgress: rows.length - scored.length - partHeld - left,
    scored: scored.length,
    conformance: conf === null ? null : Math.round(conf),
    noDeviation: noDev,
    noDeviationShare: scored.length ? Math.round((noDev / scored.length) * 100) : null,
    avgCheckSeconds: time === null ? null : Math.round(time),
    timed: timed.length,
    openDiscrepancies: rows.reduce((n, r) => n + r.openDiscrepancies, 0),
  };
}
