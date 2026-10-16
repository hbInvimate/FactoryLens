// Completed sessions with exact step times, for the SOP analysis tests.
import type { Action, ActionBody } from "../lib/check/types";
import { fromPlantLocal } from "../lib/shifts";
import { STEPS } from "../lib/sop";
import type { StatSession } from "../lib/sop-stats";

export interface TimedSpec {
  day: string;
  time: string;
  /** Seconds for step 7 (default 10). */
  step7?: number;
  /** Seconds for any step; a step not listed takes 10 seconds (step 7: `step7`). */
  steps?: Partial<Record<number, number>>;
  /** The Quality Technician label. */
  operator?: string;
  /** The order the points of a step are tapped in (default: the SOP order). */
  order?: Partial<Record<number, string[]>>;
  /** Step 7: H9 to H12 skipped, then fixed (not correct on the first attempt). */
  skip7?: boolean;
  /** A pause of this many seconds in the middle of step 7 (not counted). */
  pause7?: number;
  sample?: boolean;
}

export function timedActions(id: string, s: TimedSpec): { createdAt: number; actions: Action[] } {
  const createdAt = fromPlantLocal(s.day, s.time);
  const actions: Action[] = [];
  let seq = 0;
  const push = (body: ActionBody, at: number) => {
    seq += 1;
    const a = { ...body, id: `${id}-${seq}`, seq, at } as Action;
    actions.push(a);
    return a;
  };
  let t = createdAt;
  for (const st of STEPS) {
    const dur = (s.steps?.[st.n] ?? (st.n === 7 ? s.step7 ?? 10 : 10)) * 1000;
    const pause = st.n === 7 && s.pause7 ? s.pause7 * 1000 : 0;
    const missing = st.n === 7 && s.skip7 ? ["H9", "H10", "H11", "H12"] : [];
    let k = 0;
    for (const p of s.order?.[st.n] ?? st.points) if (!missing.includes(p)) push({ type: "tap_point", step: st.n, point: p }, t + ++k * 10);
    if (pause) {
      push({ type: "pause" } as ActionBody, t + 2000);
      push({ type: "resume" } as ActionBody, t + 2000 + pause);
    }
    const end = t + dur + pause;
    if (missing.length) {
      const next = push({ type: "next_step", step: st.n }, t + Math.floor(dur / 2) + pause);
      for (const p of missing) push({ type: "tap_point", step: st.n, point: p }, t + Math.floor(dur / 2) + pause + ++k * 10);
      push({ type: "fix_continue", deviation: next.id }, end);
    } else {
      push({ type: "next_step", step: st.n }, end);
    }
    t = end;
  }
  return { createdAt, actions };
}

export function statSession(id: string, s: TimedSpec): StatSession {
  const { createdAt, actions } = timedActions(id, s);
  return { id, startedAt: createdAt, isSample: s.sample === true, operator: s.operator ?? "QT-test", actions };
}

/**
 * The fixed dataset. Step 7 times, real sessions: 100, 120, 130 (with a 60 s pause, not counted),
 * 160, 200 (correct first time) and 180 (skipped, then fixed). One sample session: 50.
 * Shifts: A 06-14, B 14-22, C 22-06.
 */
export const DATASET: Record<string, TimedSpec> = {
  r1: { day: "2026-09-20", time: "08:00", step7: 100 },
  r2: { day: "2026-09-20", time: "09:00", step7: 120 },
  r3: { day: "2026-09-20", time: "15:00", step7: 130, pause7: 60 },
  r4: { day: "2026-09-20", time: "16:00", step7: 160 },
  r5: { day: "2026-09-20", time: "23:00", step7: 200 },
  r6: { day: "2026-09-20", time: "10:00", step7: 180, skip7: true },
  s1: { day: "2026-09-21", time: "01:00", step7: 50, sample: true },
};

/** Every step 10 s except steps 5, 7 and 9: a whole check of 490 s. */
export const BASE_STEPS = { 5: 40, 7: 180, 9: 180 };
/** Technician A: 12% faster on steps 5, 7 and 9: 433 s, 12% faster than 490. */
export const FAST_STEPS = { 5: 35, 7: 158, 9: 150 };
/** Technician B (newest 3) and E: faster on 5 and 7 only: 463 s, 5.5% faster. */
export const B_FAST_STEPS = { 5: 35, 7: 158, 9: 180 };

const holes = Array.from({ length: 14 }, (_, i) => `H${i + 1}`);
/** Odd holes first, then the even ones. */
export const ODD_FIRST = [...holes.filter((_, i) => i % 2 === 0), ...holes.filter((_, i) => i % 2 === 1)];

export const BASELINE_WHO = ["C", "D", "F", "G", "H", "I"];

/**
 * Candidates (one-click-flow.md). Real checks: C, D, F, G, H and I at the station median pace (8 checks each,
 * 48 in all, 490 s); A faster in all 6 checks, tapping step 7 odd holes first; B faster only in their newest
 * 3 of 5; E faster but with step 7 skipped each time. S is faster still, but SAMPLE. 64 real checks; the
 * station median is 490 s.
 */
export function candidateDataset(): { key: string; spec: TimedSpec }[] {
  const out: { key: string; spec: TimedSpec }[] = [];
  const day = (i: number) => `2026-09-${String(10 + i).padStart(2, "0")}`;
  const times = ["06:30", "08:00", "10:30", "14:30", "16:00", "18:30", "22:30", "01:00"];
  for (const who of BASELINE_WHO) {
    for (let i = 0; i < 8; i++) out.push({ key: `${who}${i}`, spec: { day: day(i), time: times[(i + who.charCodeAt(0)) % 8], steps: BASE_STEPS, operator: `QT-${who}` } });
  }
  for (let i = 0; i < 6; i++) out.push({ key: `A${i}`, spec: { day: day(i), time: i % 2 ? "09:00" : "17:00", steps: FAST_STEPS, order: { 7: ODD_FIRST }, operator: "QT-A" } });
  // B: oldest two at the median pace, the newest three faster.
  for (let i = 0; i < 5; i++) out.push({ key: `B${i}`, spec: { day: day(i), time: "11:00", steps: i < 2 ? BASE_STEPS : B_FAST_STEPS, operator: "QT-B" } });
  for (let i = 0; i < 5; i++) out.push({ key: `E${i}`, spec: { day: day(i), time: "13:00", steps: B_FAST_STEPS, skip7: true, operator: "QT-E" } });
  for (let i = 0; i < 6; i++) out.push({ key: `S${i}`, spec: { day: day(i), time: "19:00", steps: { 5: 20, 7: 120, 9: 120 }, operator: "QT-S (sample)", sample: true } });
  return out;
}
