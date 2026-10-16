// Completed sessions with exact step times, for the SOP analysis tests.
import type { Action, ActionBody } from "../lib/check/types";
import { fromPlantLocal } from "../lib/shifts";
import { STEPS } from "../lib/sop";
import type { StatSession } from "../lib/sop-stats";

export interface TimedSpec {
  day: string;
  time: string;
  /** Seconds for step 7; every other step takes 10 seconds. */
  step7: number;
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
    const dur = (st.n === 7 ? s.step7 : 10) * 1000;
    const pause = st.n === 7 && s.pause7 ? s.pause7 * 1000 : 0;
    const missing = st.n === 7 && s.skip7 ? ["H9", "H10", "H11", "H12"] : [];
    let k = 0;
    for (const p of st.points) if (!missing.includes(p)) push({ type: "tap_point", step: st.n, point: p }, t + ++k * 10);
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
  return { id, startedAt: createdAt, isSample: s.sample === true, operator: "QT-test", actions };
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
