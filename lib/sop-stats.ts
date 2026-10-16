// How each step is performed, from saved sessions (docs/sop-management). Pure: no database here, so the
// maths can be tested on a fixed dataset. FactoryLens AI shows these numbers; it never says which way is better.
import { activeCheckMs, reduce, stepActiveMs } from "@/lib/check/reducer";
import type { Action } from "@/lib/check/types";
import type { ShiftId } from "@/lib/config";
import { SHIFTS } from "@/lib/config";
import { shiftOf } from "@/lib/shifts";

/** A completed session as the SOP pages need it. */
export interface StatSession {
  id: string;
  startedAt: number;
  isSample: boolean;
  operator: string;
  actions: Action[];
}

export interface ShiftStat {
  shift: ShiftId;
  sessions: number;
  medianSeconds: number | null;
}

export interface StepStat {
  step: number;
  /** Completed sessions in the view (the step was done in each). */
  sessions: number;
  medianSeconds: number | null;
  /** The 25th percentile: a quarter of the sessions were this fast or faster. */
  fastestQuarterSeconds: number | null;
  /** Share of the sessions with the step correct on the first attempt, 0 to 100. Null without sessions. */
  firstTimeCorrect: number | null;
  byShift: ShiftStat[];
}

export interface EvidenceRow {
  id: string;
  startedAt: number;
  shift: ShiftId;
  stepSeconds: number;
  checkSeconds: number | null;
  isSample: boolean;
  operator: string;
}

/**
 * Percentile with linear interpolation between neighbours, as Postgres percentile_cont does
 * (the dashboard's median uses the same rule). p from 0 to 1. Null for no values.
 */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const pos = (v.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

const secs = (ms: number | null) => (ms === null ? null : Math.round(ms / 1000));

interface Reduced {
  s: StatSession;
  shift: ShiftId;
  stepMs: (number | null)[];
  correct: boolean[];
  checkMs: number | null;
}

function reduceAll(sessions: StatSession[]): Reduced[] {
  return sessions.map((s) => {
    const st = reduce(s.actions, s.startedAt);
    return {
      s,
      shift: shiftOf(s.startedAt),
      stepMs: Array.from({ length: 12 }, (_, i) => stepActiveMs(st, i + 1)),
      correct: st.steps.map((r) => r.outcome === "correct"),
      checkMs: activeCheckMs(st),
    };
  });
}

function stepStat(rows: Reduced[], n: number): StepStat {
  const done = rows.filter((r) => r.stepMs[n - 1] !== null);
  const times = done.map((r) => (r.stepMs[n - 1] as number) / 1000);
  const round = (x: number | null) => (x === null ? null : Math.round(x));
  return {
    step: n,
    sessions: done.length,
    medianSeconds: round(percentile(times, 0.5)),
    fastestQuarterSeconds: round(percentile(times, 0.25)),
    firstTimeCorrect: done.length ? Math.round((done.filter((r) => r.correct[n - 1]).length / done.length) * 100) : null,
    byShift: SHIFTS.map((sh) => {
      const t = done.filter((r) => r.shift === sh.id).map((r) => (r.stepMs[n - 1] as number) / 1000);
      return { shift: sh.id, sessions: t.length, medianSeconds: round(percentile(t, 0.5)) };
    }),
  };
}

/** Stats for every step. `sessions` must be completed sessions only. */
export function stepStats(sessions: StatSession[]): StepStat[] {
  const rows = reduceAll(sessions);
  return Array.from({ length: 12 }, (_, i) => stepStat(rows, i + 1));
}

/** Stats for one step, and its evidence: sessions with the step correct on the first attempt, fastest first. */
export function stepAnalysis(sessions: StatSession[], n: number): { stat: StepStat; evidence: EvidenceRow[] } {
  const rows = reduceAll(sessions);
  const evidence = rows
    .filter((r) => r.correct[n - 1] && r.stepMs[n - 1] !== null)
    .map((r) => ({
      id: r.s.id,
      startedAt: r.s.startedAt,
      shift: r.shift,
      stepSeconds: secs(r.stepMs[n - 1]) as number,
      checkSeconds: secs(r.checkMs),
      isSample: r.s.isSample,
      operator: r.s.operator,
    }))
    .sort((a, b) => a.stepSeconds - b.stepSeconds || a.startedAt - b.startedAt);
  return { stat: stepStat(rows, n), evidence };
}

/** "02:40" from seconds. */
export function mmss(seconds: number | null): string {
  if (seconds === null) return "not set";
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** "2:40", "02:40" or "160" (seconds) to seconds; null if it is not a time. 1 second to 59:59. */
export function parseMmss(v: string): number | null {
  const t = v.trim();
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(t);
  const s = m ? Number(m[1]) * 60 + Number(m[2]) : /^\d{1,4}$/.test(t) ? Number(t) : NaN;
  return Number.isInteger(s) && s >= 1 && s <= 3599 ? s : null;
}

/** "−0:20", "+1:05", "±0:00". */
export function deltaText(fromSeconds: number, toSeconds: number): string {
  const d = toSeconds - fromSeconds;
  const a = Math.abs(d);
  const sign = d < 0 ? "−" : d > 0 ? "+" : "±";
  return `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}
