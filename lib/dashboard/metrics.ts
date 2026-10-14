// The numbers on /dashboard. Read-only, from saved sessions.
// Conformance of a session = steps correct on the first attempt / 12 (stored per session).
// Only complete sessions are scored. Held, scrapped, reworked, conceded and left sessions are left out of every average.
import { HOLD_WARN_MINUTES, SAMPLE_DEFAULT_BELOW } from "@/lib/config";
import { ENDED_WITHOUT_CHECK, ON_HOLD_STATUSES, type SessionStatus } from "@/lib/check/types";

export interface DashSession {
  status: SessionStatus;
  /** Null when not scored. */
  conformance: number | null;
  deviations: number;
  /** Check time in seconds. Null when not recorded. */
  activeSeconds: number | null;
  openDiscrepancies: number;
  /** When the oldest open hold started, if the session is on hold. */
  holdStartedAt?: Date | null;
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

/** "Include sample data" is on by default while there are few real sessions. ?sample=1 or 0 overrides. */
export function includeSampleFor(param: unknown, realSessions: number): boolean {
  if (param === "1") return true;
  if (param === "0") return false;
  return realSessions < SAMPLE_DEFAULT_BELOW;
}

export const isOnHold =(status: SessionStatus) => ON_HOLD_STATUSES.includes(status);

/** A complete, scored session. */
export function isScored(s: DashSession): boolean {
  return s.status === "complete" && s.conformance !== null;
}

/** What the conformance column says. */
export function conformanceLabel(status: SessionStatus, conformance: number | null): string {
  if (status === "complete" && conformance !== null) return `${conformance}%`;
  if (status === "running" || status === "paused") return "In progress";
  return "Not scored";
}

/** Amber while waiting, red once over the limit in lib/config.ts. */
export function waitTone(waitedMs: number): "amber" | "red" {
  return waitedMs > HOLD_WARN_MINUTES * 60_000 ? "red" : "amber";
}

export interface Summary {
  total: number;
  complete: number;
  onHold: number;
  endedWithoutCheck: number;
  left: number;
  inProgress: number;
  scored: number;
  /** Average conformance, percent. Null: not recorded (no complete sessions). */
  conformance: number | null;
  noDeviation: number;
  /** Share of complete sessions with no deviation, percent. */
  noDeviationShare: number | null;
  /** Average check time in seconds over complete sessions with a recorded time. */
  avgCheckSeconds: number | null;
  timed: number;
  openDiscrepancies: number;
  /** When the oldest open hold started. */
  oldestHold: Date | null;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function summarise(rows: DashSession[]): Summary {
  const scored = rows.filter(isScored);
  const timed = scored.map((r) => r.activeSeconds).filter((x): x is number => x !== null);
  const noDev = scored.filter((r) => r.deviations === 0).length;
  const conf = avg(scored.map((r) => r.conformance!));
  const time = avg(timed);
  const held = rows.filter((r) => isOnHold(r.status));
  const holdStarts = held.map((r) => r.holdStartedAt).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
  const endedWithoutCheck = rows.filter((r) => ENDED_WITHOUT_CHECK.includes(r.status)).length;
  const left = rows.filter((r) => r.status === "left").length;
  return {
    total: rows.length,
    complete: rows.filter((r) => r.status === "complete").length,
    onHold: held.length,
    endedWithoutCheck,
    left,
    inProgress: rows.filter((r) => r.status === "running" || r.status === "paused").length,
    scored: scored.length,
    conformance: conf === null ? null : Math.round(conf),
    noDeviation: noDev,
    noDeviationShare: scored.length ? Math.round((noDev / scored.length) * 100) : null,
    avgCheckSeconds: time === null ? null : Math.round(time),
    timed: timed.length,
    openDiscrepancies: rows.reduce((n, r) => n + r.openDiscrepancies, 0),
    oldestHold: holdStarts[0] ?? null,
  };
}
