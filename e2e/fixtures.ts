// Builds a session's action log from a short description, with exact times. Shared by the dashboard tests.
import type { Action, ActionBody, HoldOutcome } from "../lib/check/types";
import { fromPlantLocal } from "../lib/shifts";
import { STEPS } from "../lib/sop";

const MIN = 60_000;

export interface Spec {
  day: string;
  time: string;
  /** Step 12 is done this many minutes after the start (no pauses), unless the session stops or is left. */
  minutes?: number;
  skip?: { step: number; missing: string[] };
  wrongOrder?: boolean;
  /** Lodge an issue `afterMin` minutes after the start, at `step` (after the steps before it are done). */
  lodge?: { step: number; issue: string; afterMin: number; decision?: HoldOutcome; by?: string; reason?: string; called?: string };
  /** Older sessions: the stop closed with the old "clear" action (ends as part held). */
  legacyClear?: "cleared" | "scrapped";
  fixedOnSpot?: { step: number; issue: string };
  leaveAtStep?: number;
  /** Stop after this step, still running. */
  stopAfterStep?: number;
}

export function build(id: string, s: Spec): { createdAt: number; actions: Action[] } {
  const createdAt = fromPlantLocal(s.day, s.time);
  const actions: Action[] = [];
  let t = createdAt;
  let seq = 0;
  const push = (body: ActionBody, at?: number) => {
    t = at ?? t + 1000;
    seq += 1;
    actions.push({ ...body, id: `${id}-${seq}`, seq, at: t } as Action);
    return actions[actions.length - 1];
  };
  for (const st of STEPS) {
    const n = st.n;
    if (s.leaveAtStep === n) {
      push({ type: "leave", reason: "End of shift", end: true });
      break;
    }
    if (s.fixedOnSpot?.step === n) push({ type: "fixed_on_spot", did: `${id}-f`, step: n, issue: s.fixedOnSpot.issue, done: [] });
    if (s.lodge?.step === n) {
      push({ type: "lodge", did: `${id}-d`, step: n, issue: s.lodge.issue, tried: [] }, createdAt + s.lodge.afterMin * MIN);
      if (s.lodge.called) push({ type: "call_marked", did: `${id}-d`, who: s.lodge.called });
      if (s.legacyClear) {
        push({ type: "clear", did: `${id}-d`, who: "Quality", outcome: s.legacyClear, reason: "Old flow" }, t + 2 * MIN);
        break;
      }
      if (!s.lodge.decision) break; // on hold, no decision yet
      push(
        { type: "hold_decision", did: `${id}-d`, outcome: s.lodge.decision, by: s.lodge.by ?? "Quality", reason: s.lodge.reason ?? "Fixed test", decidedAt: t + MIN },
        t + 2 * MIN,
      );
      if (s.lodge.decision !== "cleared") break;
    }
    if (n === 5 && s.wrongOrder) {
      push({ type: "tap_point", step: 5, point: "C1" });
      push({ type: "tap_point", step: 5, point: "C2" });
      const wrong = push({ type: "tap_point", step: 5, point: "C4" });
      push({ type: "release_clamps", step: 5 });
      for (const p of st.points) push({ type: "tap_point", step: 5, point: p });
      push({ type: "fix_continue", deviation: wrong.id });
      continue;
    }
    const missing = s.skip?.step === n ? s.skip.missing : [];
    for (const p of st.points) if (!missing.includes(p)) push({ type: "tap_point", step: n, point: p });
    const last = n === 12 && s.minutes ? createdAt + s.minutes * MIN : undefined;
    const next = push({ type: "next_step", step: n }, missing.length ? undefined : last);
    if (missing.length) {
      for (const p of missing) push({ type: "tap_point", step: n, point: p });
      push({ type: "fix_continue", deviation: next.id }, last);
    }
    if (s.stopAfterStep === n) break;
  }
  return { createdAt, actions };
}
