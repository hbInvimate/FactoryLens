// The Supervisor's live view of one check (/supervisor/live/[id]): rebuilt from the check's action log on every
// request, the same way the check app rebuilds it. Read-only. Real data only: nothing here is invented.
import { activeAt, checkPointsDone, elapsedMs, reduce, stepActiveMs, stepsDone } from "@/lib/check/reducer";
import { deviationText } from "@/lib/check/text";
import type { Action, SessionStatus } from "@/lib/check/types";
import { STEPS, STEP_COUNT } from "@/lib/sop";
import { CODE_REVISION, REV_A_LABEL } from "@/lib/sop-revisions";
import { getRepo } from "./repo";
import { runnableRevisions } from "./sop";

/** Steps where every point needs a recorded value (the value confirms the point). */
const MEASURED_STEPS = [7, 8, 9, 10];

export type Tone = "green" | "amber" | "gray" | "red";

export interface LiveStep {
  n: number;
  name: string;
  state: "done" | "current" | "upcoming";
  /** Active time the step took, seconds. Null until done. */
  seconds: number | null;
  targetSeconds: number | null;
  /** A deviation was raised on this step. */
  deviation: boolean;
}

export interface LiveValue {
  point: string;
  /** "10.02 mm" for a measured value; null when the point is pending. Points confirmed by tap show "Done". */
  value: string | null;
}

export interface LiveEvent {
  at: string;
  /** Active time since the start, "12:04". */
  since: string;
  tone: Tone;
  text: string;
}

export interface LiveView {
  id: string;
  ownerId: string | null;
  part: string;
  station: string;
  technician: string;
  sopLabel: string;
  startedAt: string;
  status: SessionStatus;
  /** 1 to 12; 13 once step 12 is done. */
  current: number;
  stepsDone: number;
  elapsedSeconds: number;
  /** The whole check's target: the sum of the step targets of the revision it runs on. */
  targetSeconds: number | null;
  checkPoints: number;
  deviations: number;
  /** Deviations fixed by the Quality Technician. */
  corrected: number;
  steps: LiveStep[];
  /** The current step and its points. Null once step 12 is done or the check has ended. */
  now: { n: number; name: string; measured: boolean; values: LiveValue[] } | null;
  /** Newest first. */
  activity: LiveEvent[];
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

export async function liveView(id: string, now = Date.now()): Promise<LiveView | null> {
  const j = await getRepo().journal(id);
  if (!j) return null;
  const s = reduce(j.actions, j.meta.createdAt);
  const revs = await runnableRevisions();
  // The revision the check runs on; older checks without one ran on revision A.
  const rev = revs.find((r) => j.meta.sopRevisionId && r.id === j.meta.sopRevisionId) ?? revs.find((r) => r.label === REV_A_LABEL) ?? CODE_REVISION;
  const targets = STEPS.map((_, i) => rev.steps[i]?.targetCtSeconds ?? null);
  const ended = s.status !== "running" && s.status !== "paused" && s.status !== "on_hold" && s.status !== "stopped";

  const steps: LiveStep[] = STEPS.map((st, i) => {
    const run = s.steps[i];
    const ms = stepActiveMs(s, st.n);
    return {
      n: st.n,
      name: st.name,
      state: run.doneAt !== null ? "done" : st.n === s.current && !ended ? "current" : "upcoming",
      seconds: ms === null ? null : Math.round(ms / 1000),
      targetSeconds: targets[i],
      deviation: s.deviations.some((d) => d.step === st.n),
    };
  });

  let nowStep: LiveView["now"] = null;
  if (!ended && s.current <= STEP_COUNT) {
    const st = STEPS[s.current - 1];
    const measured = MEASURED_STEPS.includes(st.n);
    // The latest recorded value per point (a correction replaces the earlier one).
    const latest = new Map<string, Extract<Action, { type: "measure" }>>();
    for (const a of j.actions) if (a.type === "measure" && a.step === st.n && a.status === "recorded" && a.value !== null) latest.set(a.point, a);
    const confirmed = new Set(s.steps[st.n - 1].confirmed.map((c) => c.point));
    nowStep = {
      n: st.n,
      name: st.name,
      measured,
      values: st.points.map((p) => {
        const m = latest.get(p);
        return { point: p, value: measured ? (m ? `${m.value} ${m.unit}` : null) : confirmed.has(p) ? "Done" : null };
      }),
    };
  }

  const ev: { at: number; tone: Tone; text: string }[] = [{ at: s.startedAt, tone: "gray", text: `Check started by ${j.meta.operator}` }];
  for (const st of steps) {
    const run = s.steps[st.n - 1];
    if (run.doneAt === null) continue;
    const over = st.seconds !== null && st.targetSeconds !== null && st.seconds > st.targetSeconds;
    const took = st.seconds === null ? "" : ` in ${mmss(st.seconds * 1000)}`;
    ev.push({ at: run.doneAt, tone: over ? "amber" : "green", text: over ? `Step ${st.n} done${took}, over its ${mmss(st.targetSeconds! * 1000)} target` : `Step ${st.n} done${took}: ${STEPS[st.n - 1].short}` });
  }
  for (const d of s.deviations) {
    ev.push({ at: d.raisedAt, tone: "amber", text: `Deviation: ${deviationText(d).log}` });
    if (d.fixedAt !== null) ev.push({ at: d.fixedAt, tone: "green", text: `Step ${d.step} corrected` });
  }
  for (const d of s.discrepancies) {
    ev.push({ at: d.loggedAt, tone: d.effect === "stop" ? "red" : "amber", text: `${d.status === "fixed_on_spot" ? "Fixed on the spot" : "Discrepancy lodged"} at step ${d.step}: ${d.issue}` });
    if (d.closedAt !== null && d.status !== "fixed_on_spot") ev.push({ at: d.closedAt, tone: "gray", text: `Hold closed${d.clearedBy ? ` by ${d.clearedBy}` : ""}: ${d.issue}` });
  }
  for (const p of s.pauses) {
    ev.push({ at: p.from, tone: "gray", text: "Paused" });
    if (p.to !== null) ev.push({ at: p.to, tone: "gray", text: "Resumed" });
  }
  if (s.status === "complete") ev.push({ at: s.endedAt ?? s.steps[STEP_COUNT - 1].doneAt ?? s.lastAt, tone: "green", text: "Check complete" });
  if (s.left) ev.push({ at: s.left.at, tone: "gray", text: `Left the check: ${s.left.reason}` });

  const sum = targets.every((x) => x !== null) ? targets.reduce((a, b) => a! + b!, 0) : null;
  return {
    id,
    ownerId: j.ownerId,
    part: j.meta.part,
    station: (j.meta.station ?? j.meta.fixture).trim(),
    technician: j.meta.operator,
    sopLabel: rev.label,
    startedAt: new Date(s.startedAt).toISOString(),
    status: s.status,
    current: s.current,
    stepsDone: stepsDone(s),
    elapsedSeconds: Math.round(elapsedMs(s, now) / 1000),
    targetSeconds: sum,
    checkPoints: checkPointsDone(s),
    deviations: s.deviations.length,
    corrected: s.deviations.filter((d) => d.fixedAt !== null).length,
    steps,
    now: nowStep,
    activity: ev
      .sort((a, b) => b.at - a.at)
      .map((e) => ({ at: new Date(e.at).toISOString(), since: mmss(activeAt(s, e.at)), tone: e.tone, text: e.text })),
  };
}
