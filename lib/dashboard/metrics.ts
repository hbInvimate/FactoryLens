// Small rules the dashboard shares between server and browser. The numbers themselves are
// database aggregates (lib/server/analytics.ts). Only complete sessions are scored or timed.
import { HOLD_WARN_MINUTES, SAMPLE_DEFAULT_BELOW } from "@/lib/config";
import { ON_HOLD_STATUSES, type SessionStatus } from "@/lib/check/types";

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

export const isOnHold = (status: SessionStatus) => ON_HOLD_STATUSES.includes(status);

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
