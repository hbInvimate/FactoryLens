// Rebuilds the check from its action log. Pure: same log, same state, on any machine.
import { CONTINUE_TODO, findIssue, opensHoleProcedure, STOP_TODO } from "@/lib/issues";
import { MAX_TRIALS, PROC_SECTIONS } from "@/lib/procedure";
import { countsAsCheckPoint, describePoints, missingVerb, step as sopStep, STEP_COUNT, STEPS } from "@/lib/sop";
import type {
  Action, ActionType, CheckState, Deviation, Discrepancy, StepEventKind, StepRun,
} from "./types";

export const UNDO_WINDOW_MS = 10_000;

const UNDOABLE = new Set<ActionType>([
  "tap_point", "next_step", "release_clamps", "proc_tick", "todo_tick", "handoff", "call_marked",
  "proc_holes", "proc_parts",
]);

const HOLES = new Set(STEPS[6].points);
const G_KEYS = PROC_SECTIONS.find((s) => s.id === "G")!.items.map((i) => i.key);
const PROC_KEYS = new Set(PROC_SECTIONS.flatMap((s) => s.items.map((i) => i.key)));

export function sortActions(actions: Action[]): Action[] {
  return [...actions].sort((a, b) => a.seq - b.seq || a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function initial(startedAt: number): CheckState {
  return {
    startedAt,
    endedAt: null,
    current: 1,
    steps: STEPS.map((s) => ({
      n: s.n, confirmed: [], wrong: [], needsRelease: false, startedAt: null, doneAt: null, outcome: "pending",
    })),
    deviations: [],
    discrepancies: [],
    paused: false,
    pauses: [],
    leaves: [],
    stepEvents: [],
    status: "running",
    raisers: new Set(),
    lastAt: startedAt,
  };
}

export function openDeviation(s: CheckState): Deviation | null {
  return s.deviations.find((d) => d.fixedAt === null) ?? null;
}

export function isLocked(s: CheckState): boolean {
  return s.status === "stopped" || s.status === "part_held";
}

function fold(actions: Action[], startedAt: number, undone: Set<string>): CheckState {
  const s = initial(startedAt);
  for (const a of actions) {
    if (a.type === "undo" || undone.has(a.id)) continue;
    apply(s, a);
    s.lastAt = Math.max(s.lastAt, a.at);
    s.status = deriveStatus(s);
  }
  return s;
}

/** Undo removes an action (within 10 seconds) as if it never happened. Actions that raised a deviation stay. */
export function reduce(actions: Action[], startedAt: number): CheckState {
  const sorted = sortActions(actions);
  const first = fold(sorted, startedAt, new Set());
  const byId = new Map(sorted.map((a) => [a.id, a]));
  const undone = new Set<string>();
  for (const a of sorted) {
    if (a.type !== "undo") continue;
    const t = byId.get(a.target);
    if (t && UNDOABLE.has(t.type) && !first.raisers.has(t.id) && a.at - t.at <= UNDO_WINDOW_MS + 2_000) {
      undone.add(t.id);
    }
  }
  return undone.size ? fold(sorted, startedAt, undone) : first;
}

/** The action an Undo button would revert right now, if any. */
export function undoCandidate(actions: Action[], s: CheckState, now: number): Action | null {
  const sorted = sortActions(actions);
  const undoneIds = new Set(sorted.filter((a) => a.type === "undo").map((a) => (a as { target: string }).target));
  for (let i = sorted.length - 1; i >= 0; i--) {
    const a = sorted[i];
    if (a.type === "undo" || undoneIds.has(a.id)) continue;
    if (!UNDOABLE.has(a.type) || s.raisers.has(a.id) || now - a.at > UNDO_WINDOW_MS) return null;
    return a;
  }
  return null;
}

function event(s: CheckState, a: Action, step: number, kind: StepEventKind, attempt: number, detail = "") {
  s.stepEvents.push({ id: `${a.id}:${s.stepEvents.length}`, step, kind, attempt, detail, at: a.at });
}

function completeStep(s: CheckState, run: StepRun, at: number) {
  run.doneAt = at;
  run.outcome = s.deviations.some((d) => d.step === run.n) ? "corrected" : "correct";
  s.current = run.n + 1;
  if (s.current <= STEP_COUNT) {
    const next = s.steps[s.current - 1];
    next.startedAt ??= at;
  }
}

export function missingPoints(run: StepRun): string[] {
  const have = new Set(run.confirmed.map((c) => c.point));
  return sopStep(run.n).points.filter((p) => !have.has(p));
}

function findDisc(s: CheckState, did: string): Discrepancy | undefined {
  return s.discrepancies.find((d) => d.id === did);
}

function apply(s: CheckState, a: Action) {
  if (s.status === "part_held") return;
  if (s.paused && a.type !== "resume" && a.type !== "leave") return;
  if (s.steps[0].startedAt === null) s.steps[0].startedAt = s.startedAt;

  switch (a.type) {
    case "pause":
      s.paused = true;
      s.pauses.push({ from: a.at, to: null });
      return;
    case "resume": {
      s.paused = false;
      const p = s.pauses[s.pauses.length - 1];
      if (p && p.to === null) p.to = a.at;
      return;
    }
    case "leave":
      s.leaves.push({ at: a.at, reason: a.reason.slice(0, 500) });
      if (!s.paused) {
        s.paused = true;
        s.pauses.push({ from: a.at, to: null });
      }
      return;

    case "tap_point": {
      if (isLocked(s) || a.step !== s.current || a.step > STEP_COUNT) return;
      const def = sopStep(a.step);
      const run = s.steps[a.step - 1];
      if (!def.points.includes(a.point) || run.confirmed.some((c) => c.point === a.point)) return;
      const dev = openDeviation(s);
      if (dev && dev.step !== a.step) return;
      if (def.ordered) {
        if (run.needsRelease) return;
        const expected = missingPoints(run)[0];
        if (a.point !== expected) {
          s.raisers.add(a.id);
          run.wrong = [a.point];
          run.needsRelease = true;
          if (dev) {
            dev.failed += 1;
            event(s, a, a.step, "wrong_order", dev.failed, `Clamp ${a.point} closed before ${expected}`);
          } else {
            s.deviations.push({
              id: a.id, step: a.step, kind: "wrong_order", missing: [], tapped: a.point, expected,
              failed: 1, raisedAt: a.at, fixedAt: null, trainerCalledAt: null,
            });
            event(s, a, a.step, "wrong_order", 1, `Clamp ${a.point} closed before ${expected}`);
          }
          return;
        }
      }
      run.confirmed.push({ id: a.id, point: a.point, at: a.at, order: run.confirmed.length + 1 });
      return;
    }

    case "release_clamps": {
      if (isLocked(s) || a.step !== s.current || a.step > STEP_COUNT || !sopStep(a.step).ordered) return;
      const run = s.steps[a.step - 1];
      run.confirmed = [];
      run.wrong = [];
      run.needsRelease = false;
      return;
    }

    case "next_step": {
      if (isLocked(s) || a.step !== s.current || a.step > STEP_COUNT || openDeviation(s)) return;
      const run = s.steps[a.step - 1];
      const missing = missingPoints(run);
      if (missing.length) {
        s.raisers.add(a.id);
        s.deviations.push({
          id: a.id, step: a.step, kind: "skipped", missing, failed: 1,
          raisedAt: a.at, fixedAt: null, trainerCalledAt: null,
        });
        event(s, a, a.step, "skipped", 1, `${describePoints(missing)} ${missingVerb(a.step)}`);
        return;
      }
      event(s, a, a.step, "done", 1);
      completeStep(s, run, a.at);
      return;
    }

    case "fix_continue": {
      const dev = openDeviation(s);
      if (isLocked(s) || !dev || dev.id !== a.deviation) return;
      const run = s.steps[dev.step - 1];
      const missing = missingPoints(run);
      if (missing.length === 0 && !run.needsRelease) {
        dev.fixedAt = a.at;
        event(s, a, dev.step, "fixed", dev.failed + 1);
        completeStep(s, run, a.at);
        return;
      }
      dev.failed += 1;
      event(s, a, dev.step, dev.kind, dev.failed, `Still ${missingVerb(dev.step)}: ${describePoints(missing)}`);
      return;
    }

    case "call_trainer": {
      const dev = openDeviation(s);
      if (!dev || dev.id !== a.deviation || dev.trainerCalledAt) return;
      dev.trainerCalledAt = a.at;
      event(s, a, dev.step, "cannot_do", dev.failed, "Trainer called");
      return;
    }

    case "fixed_on_spot":
    case "lodge": {
      if (findDisc(s, a.did)) return;
      const issue = findIssue(a.step, a.issue);
      if (!issue) return;
      const lodged = a.type === "lodge";
      s.discrepancies.push({
        id: a.did, step: a.step, issue: issue.label, kind: issue.kind, effect: issue.effect,
        who: issue.who, note: issue.note,
        status: lodged ? "open" : "fixed_on_spot",
        loggedAt: a.at,
        done: (lodged ? a.tried : a.done).filter((x) => issue.fix.includes(x)),
        called: [],
        todo: (issue.effect === "stop" ? STOP_TODO : CONTINUE_TODO).map(() => false),
        handoff: { marks: false, photos: 0, sheet: false, handedOverAt: null },
        clearedBy: null, clearReason: null, closedAt: lodged ? null : a.at,
        proc: lodged && opensHoleProcedure(a.step, issue.label)
          ? { ticks: {}, holes: [], parts: 0, trials: [], trialStartedAt: null, passedAt: null }
          : null,
      });
      if (lodged && issue.effect === "stop") {
        const at = s.current <= STEP_COUNT ? s.current : STEP_COUNT;
        event(s, a, a.step || at, "cannot_do", 1, `Stopped: ${issue.label}`);
      }
      return;
    }

    case "call_marked": {
      const d = findDisc(s, a.did);
      if (d && d.who.includes(a.who) && !d.called.includes(a.who)) d.called.push(a.who);
      return;
    }
    case "todo_tick": {
      const d = findDisc(s, a.did);
      if (d && a.index >= 0 && a.index < d.todo.length) d.todo[a.index] = !d.todo[a.index];
      return;
    }
    case "handoff": {
      const d = findDisc(s, a.did);
      if (!d || d.status !== "open" && d.status !== "escalated") return;
      if (a.item === "photo") d.handoff.photos += 1;
      else if (a.item === "marks") d.handoff.marks = true;
      else if (a.item === "sheet") d.handoff.sheet = true;
      else if (a.item === "handed_over") d.handoff.handedOverAt ??= a.at;
      return;
    }
    case "clear": {
      const d = findDisc(s, a.did);
      if (!d || (d.status !== "open" && d.status !== "escalated")) return;
      d.status = a.outcome;
      d.clearedBy = a.who.slice(0, 200);
      d.clearReason = a.reason.slice(0, 1000);
      d.closedAt = a.at;
      if (d.effect === "stop") s.endedAt = a.at;
      return;
    }

    case "proc_tick": {
      const p = findDisc(s, a.did)?.proc;
      if (p && PROC_KEYS.has(a.key)) p.ticks[a.key] = !p.ticks[a.key];
      if (p && a.key.startsWith("G")) p.trialStartedAt ??= a.at;
      return;
    }
    case "proc_holes": {
      const p = findDisc(s, a.did)?.proc;
      if (p) p.holes = [...new Set(a.holes.filter((h) => HOLES.has(h)))];
      return;
    }
    case "proc_parts": {
      const p = findDisc(s, a.did)?.proc;
      if (p && Number.isFinite(a.count)) p.parts = Math.max(0, Math.min(9999, Math.round(a.count)));
      return;
    }
    case "trial_outcome": {
      const d = findDisc(s, a.did);
      const p = d?.proc;
      if (!d || !p || d.status !== "open" || p.passedAt || p.trials.length >= MAX_TRIALS) return;
      p.trials.push({ outcome: a.outcome, at: a.at });
      if (a.outcome === "pass") p.passedAt = a.at;
      else if (a.outcome === "no_better" || p.trials.length >= MAX_TRIALS) d.status = "escalated";
      else {
        for (const k of G_KEYS) delete p.ticks[k];
        p.trialStartedAt = null;
      }
      return;
    }
    case "proc_close": {
      const d = findDisc(s, a.did);
      if (!d?.proc?.passedAt || d.status !== "open") return;
      d.status = "released";
      d.closedAt = a.at;
      return;
    }
  }
}

function deriveStatus(s: CheckState): CheckState["status"] {
  const stops = s.discrepancies.filter((d) => d.effect === "stop" && d.status !== "fixed_on_spot");
  if (stops.some((d) => d.status === "open" || d.status === "escalated")) return "stopped";
  if (stops.length) return "part_held";
  if (s.paused) return "paused";
  if (openHolds(s).length) return "on_hold";
  if (s.current > STEP_COUNT) return "complete";
  return "running";
}

/** Lodged "continue" issues still holding the cell. */
export function openHolds(s: CheckState): Discrepancy[] {
  return s.discrepancies.filter((d) => d.effect === "continue" && (d.status === "open" || d.status === "escalated"));
}

export function activeStop(s: CheckState): Discrepancy | null {
  return s.discrepancies.find((d) => d.effect === "stop" && (d.status === "open" || d.status === "escalated")) ?? null;
}

// ---------- derived numbers ----------

export function stepsDone(s: CheckState): number {
  return s.steps.filter((r) => r.doneAt !== null).length;
}

export function checkPointsDone(s: CheckState): number {
  let n = 0;
  for (const r of s.steps) {
    const def = sopStep(r.n);
    if (def.seating.length && r.doneAt !== null) n += def.seating.length;
    if (countsAsCheckPoint(r.n)) n += r.confirmed.length;
  }
  return n;
}

export function correctFirstTime(s: CheckState): number {
  return s.steps.filter((r) => r.outcome === "correct").length;
}

/** Final score: steps correct first time / 12. None for a stopped or held part. */
export function conformance(s: CheckState): number | null {
  if (s.status === "stopped" || s.status === "part_held") return null;
  if (s.current <= STEP_COUNT) return null;
  return Math.round((correctFirstTime(s) / STEP_COUNT) * 100);
}

/** Score so far, over the steps decided so far. */
export function conformanceSoFar(s: CheckState): number | null {
  const decided = s.steps.filter((r) => r.outcome !== "pending" || s.deviations.some((d) => d.step === r.n));
  if (!decided.length) return null;
  const right = decided.filter((r) => r.outcome === "correct").length;
  return Math.round((right / decided.length) * 100);
}

export function pausedMs(s: CheckState, now: number): number {
  return s.pauses.reduce((t, p) => t + ((p.to ?? now) - p.from), 0);
}

export function elapsedMs(s: CheckState, now: number): number {
  const end = s.endedAt ?? (s.status === "complete" ? s.lastAt : now);
  return Math.max(0, end - s.startedAt - pausedMs(s, Math.min(now, end)));
}
