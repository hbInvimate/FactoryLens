// About 60 realistic FAKE sessions over the last 30 days, for showing the dashboard.
// Every session is built from ordinary actions, so it goes through the same reducer and projection as a real check.
// Deterministic: the same ids and the same mix every run (timestamps follow "now").
import type { Action, ActionBody, HoldOutcome, SessionMeta } from "@/lib/check/types";
import { PLANT_TIME_ZONE, SHIFTS, type ShiftId } from "@/lib/config";
import { plantMinutes } from "@/lib/shifts";
import { SESSION_DEFAULTS, STEPS } from "@/lib/sop";

export interface SampleSession {
  meta: SessionMeta;
  actions: Action[];
}

export const SAMPLE_ID_PREFIX = "sample-";
const MIN = 60_000;
const SEC = 1_000;

/** Small seeded random generator (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Plan =
  | { kind: "clean" }
  | { kind: "skip"; step: number; missing: string[] }
  | { kind: "clamp"; step: 5 | 6; tapped: string; expected: string }
  | { kind: "skip_and_clamp"; missing: string[] }
  | { kind: "ended"; issueStep: number; issue: string; outcome: Exclude<HoldOutcome, "cleared"> }
  | { kind: "left"; atStep: number; reason: string }
  | { kind: "open_stop"; issueStep: number; issue: string };

interface Extra {
  /** A lodged issue during the check, cleared by the people called (or left open). */
  lodge?: { step: number; issue: string; decideAfterMin: number | null; by: string; reason: string };
  fixedOnSpot?: { step: number; issue: string; done: string[] };
  pauseAtStep?: number;
}

const H = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `H${from + i}`);

/** 60 plans: a mix close to what a station sees. H9 to H12 is the most common skip. */
function plans(): Plan[] {
  const p: Plan[] = [];
  for (let i = 0; i < 25; i++) p.push({ kind: "clean" });
  for (let i = 0; i < 7; i++) p.push({ kind: "skip", step: 7, missing: H(9, 12) });
  p.push({ kind: "skip", step: 7, missing: H(5, 8) }, { kind: "skip", step: 7, missing: H(5, 8) });
  p.push({ kind: "skip", step: 7, missing: H(13, 14) }, { kind: "skip", step: 7, missing: ["H13", "H14"] });
  p.push({ kind: "skip", step: 7, missing: ["H10", "H11"] });
  for (let i = 0; i < 4; i++) p.push({ kind: "clamp", step: 5, tapped: "C4", expected: "C3" });
  p.push({ kind: "clamp", step: 5, tapped: "C6", expected: "C5" }, { kind: "clamp", step: 6, tapped: "C6", expected: "C5" });
  for (let i = 0; i < 3; i++) p.push({ kind: "skip", step: 9, missing: ["T7"] });
  for (let i = 0; i < 3; i++) p.push({ kind: "skip_and_clamp", missing: H(9, 12) });
  p.push({ kind: "skip", step: 10, missing: ["F3"] }, { kind: "skip", step: 11, missing: ["V2", "V3"] });
  p.push(
    { kind: "ended", issueStep: 3, issue: "Crack seen in the part", outcome: "scrapped" },
    { kind: "ended", issueStep: 3, issue: "Part bent, dented or damaged", outcome: "rework" },
    { kind: "ended", issueStep: 3, issue: "Wrong part or variant on the fixture", outcome: "rework" },
    { kind: "ended", issueStep: 11, issue: "Crack found", outcome: "scrapped" },
    { kind: "ended", issueStep: 3, issue: "Part bent, dented or damaged", outcome: "concession" },
  );
  p.push(
    { kind: "left", atStep: 4, reason: "End of shift" },
    { kind: "left", atStep: 8, reason: "Called away" },
    { kind: "left", atStep: 2, reason: "Wrong part or session" },
  );
  p.push({ kind: "open_stop", issueStep: 4, issue: "Round locator pin (RPS-1) will not enter" });
  return p; // 60
}

/** One lodged issue per category, so every category shows up. Most are cleared by the people called. */
const CATEGORY_ISSUES: Extra["lodge"][] = [
  { step: 7, issue: "Check pin is too small: it falls through or is loose", decideAfterMin: 6, by: "Quality", reason: "Right pin fetched, hole is fine" },
  { step: 3, issue: "Part rocks, or a gap shows at a pad", decideAfterMin: 12, by: "Process engineer", reason: "Pad cleaned and part reseated, seats fine" },
  { step: 11, issue: "Coating damage, dent or handling mark", decideAfterMin: 8, by: "Quality", reason: "Cosmetic only, within the limit sample" },
  { step: 7, issue: "Several holes will not take the pin, same direction", decideAfterMin: 25, by: "Process engineer", reason: "Program offset corrected, trial part passed" },
  { step: 7, issue: "Burr, dross or slug in the hole", decideAfterMin: 9, by: "Shift supervisor", reason: "Laser operator changed the nozzle" },
  { step: 11, issue: "Part marking or traceability not readable", decideAfterMin: 5, by: "Quality", reason: "Traceability confirmed from the batch label" },
  { step: 1, issue: "Guard, clamp or edge looks unsafe", decideAfterMin: 10, by: "Shift supervisor", reason: "Guard refitted" },
  { step: 0, issue: "Tablet or quality tool not working", decideAfterMin: 7, by: "Shift supervisor", reason: "Tablet restarted, readings re-entered" },
  { step: 5, issue: "Clamps were closed in the wrong order", decideAfterMin: 4, by: "Process engineer", reason: "Released and closed again in order" },
  { step: 0, issue: "Something else", decideAfterMin: 6, by: "Shift supervisor", reason: "Forklift blocking the cell, moved" },
  { step: 9, issue: "Burr, dross or spatter on the edge", decideAfterMin: 11, by: "Process engineer", reason: "Assist gas pressure corrected" },
  { step: 2, issue: "Fixture calibration label out of date or missing", decideAfterMin: 14, by: "Quality", reason: "Calibration certificate found, label replaced" },
  { step: 8, issue: "Gauge will not fit the slot", decideAfterMin: 6, by: "Quality", reason: "Wrong gauge, right one used" },
  { step: 7, issue: "Hole is missing or not cut through", decideAfterMin: null, by: "", reason: "" }, // left open: cell still on hold
];

const FIXED_ON_SPOT: Extra["fixedOnSpot"][] = [
  { step: 2, issue: "Swarf, dross or dust on pads or pins", done: ["Wipe the pads and pins with a clean cloth", "Blow off loose swarf", "Look again: all clear?"] },
  { step: 1, issue: "Gloves cut or damaged", done: ["Take off the damaged gloves", "Put on a new pair"] },
  { step: 11, issue: "Hard to see: poor light", done: ["Use the inspection lamp", "Look again"] },
  { step: 12, issue: "Tag missing or part not labelled", done: ["Fill in the tag", "Attach it to the part"] },
];

const OPERATORS = ["QT-07 (sample)", "QT-12 (sample)", "QT-21 (sample)", "QT-03 (sample)"];
const SHIFT_PACE: Record<ShiftId, number> = { A: 1, B: 0.96, C: 1.12 };

/** Seconds per point or per single-confirmation step, before pace and jitter. */
const POINT_SECONDS: Record<number, [number, number]> = {
  1: [25, 40], 2: [45, 90], 3: [30, 50], 4: [30, 45], 5: [8, 14], 6: [8, 14], 7: [45, 75],
  8: [35, 55], 9: [40, 60], 10: [50, 70], 11: [30, 45], 12: [60, 120],
};

/** An instant `daysAgo` days back at `minuteOfDay` on the plant's clock. */
function plantInstant(now: number, daysAgo: number, minuteOfDay: number): number {
  const guess = now - daysAgo * 86_400_000;
  const diff = minuteOfDay - plantMinutes(guess, PLANT_TIME_ZONE);
  return guess + diff * MIN;
}

export function generateSample(now: number = Date.now()): SampleSession[] {
  const all = plans();
  const r = rng(20261014);
  // Spread the plans over the sessions in a fixed shuffled order.
  const order = all.map((_, i) => i).sort((a, b) => ((a * 7919) % 61) - ((b * 7919) % 61));
  const shiftsCycle: ShiftId[] = ["A", "B", "A", "C", "B", "A", "B", "C", "A", "B"];

  // Every category gets a lodged issue: give each one to a session that runs the whole check, spread out.
  const fullRuns = order.map((pi, n) => ({ pi, n })).filter(({ pi }) => ["clean", "skip", "clamp"].includes(all[pi].kind)).map(({ n }) => n);
  const lodgeAt = new Map<number, Extra["lodge"]>();
  CATEGORY_ISSUES.forEach((issue, k) => lodgeAt.set(fullRuns[Math.floor((k * fullRuns.length) / CATEGORY_ISSUES.length)], issue));

  return order.map((planIndex, n) => {
    const plan = all[planIndex];
    const id = `${SAMPLE_ID_PREFIX}${String(n + 1).padStart(3, "0")}`;
    const shift = shiftsCycle[n % shiftsCycle.length];
    const def = SHIFTS.find((s) => s.id === shift)!;
    const [sh, sm] = def.start.split(":").map(Number);
    const startMinute = (sh * 60 + sm + 20 + Math.floor(r() * 300)) % 1440; // within the first ~5 hours of the shift
    const daysAgo = plan.kind === "open_stop" ? 0.5 : 1 + Math.floor((n * 29) / 60) + (r() < 0.3 ? 1 : 0);
    let createdAt = plantInstant(now, Math.min(daysAgo, 30), startMinute);
    if (createdAt > now - 3 * 3_600_000) createdAt = now - 3 * 3_600_000 - Math.floor(r() * 3_600_000);

    const extra: Extra = {};
    if (lodgeAt.has(n)) extra.lodge = lodgeAt.get(n);
    else if ((plan.kind === "clean" || plan.kind === "skip" || plan.kind === "clamp") && n % 9 === 4) {
      extra.fixedOnSpot = FIXED_ON_SPOT[n % FIXED_ON_SPOT.length];
    }
    if (n % 7 === 3) extra.pauseAtStep = 6 + (n % 4);

    const operator = OPERATORS[n % OPERATORS.length];
    const meta: SessionMeta = {
      id, part: SESSION_DEFAULTS.part, sop: SESSION_DEFAULTS.sop, fixture: SESSION_DEFAULTS.fixture,
      station: SESSION_DEFAULTS.fixture, operator, createdAt,
    };
    return { meta, actions: build(id, createdAt, plan, extra, SHIFT_PACE[shift], r) };
  });
}

function build(id: string, start: number, plan: Plan, extra: Extra, pace: number, r: () => number): Action[] {
  const actions: Action[] = [];
  let t = start;
  let seq = 0;
  const push = (body: ActionBody, afterSec: number) => {
    t += Math.round(afterSec * SEC);
    seq += 1;
    actions.push({ ...body, id: `${id}-a${String(seq).padStart(3, "0")}`, seq, at: t } as Action);
  };
  const dur = (step: number) => {
    const [a, b] = POINT_SECONDS[step];
    return (a + r() * (b - a)) * pace;
  };
  const did = (k: string) => `${id}-${k}`;

  const lodgeHere = (step: number) => {
    const l = extra.lodge;
    if (!l || l.step !== step && !(l.step === 0 && step === 1)) return;
    push({ type: "lodge", did: did("d1"), step: l.step, issue: l.issue, tried: [] }, 20);
    push({ type: "call_marked", did: did("d1"), who: "Shift supervisor" }, 15);
    if (l.decideAfterMin !== null) {
      const decidedIn = l.decideAfterMin * 60 * (0.8 + r() * 0.4);
      push({ type: "hold_decision", did: did("d1"), outcome: "cleared", by: l.by, reason: l.reason, decidedAt: t + decidedIn * SEC - 30 * SEC }, decidedIn);
    }
  };
  const fixHere = (step: number) => {
    const f = extra.fixedOnSpot;
    if (f && f.step === step) push({ type: "fixed_on_spot", did: did("f1"), step: f.step, issue: f.issue, done: f.done }, 90);
  };
  const stopAndDecide = (step: number, issue: string, outcome: HoldOutcome | null) => {
    push({ type: "lodge", did: did("s1"), step, issue, tried: [] }, 40);
    push({ type: "call_marked", did: did("s1"), who: "Shift supervisor" }, 20);
    push({ type: "handoff", did: did("s1"), item: "marks" }, 60);
    push({ type: "handoff", did: did("s1"), item: "photo" }, 45);
    push({ type: "handoff", did: did("s1"), item: "photo" }, 20);
    push({ type: "handoff", did: did("s1"), item: "sheet" }, 120);
    push({ type: "handoff", did: did("s1"), item: "handed_over" }, 60);
    if (outcome) {
      const by = outcome === "rework" ? "Shift supervisor" : outcome === "concession" ? "Quality" : "Quality";
      const reasons: Record<HoldOutcome, string> = {
        cleared: "Checked, fine to continue",
        scrapped: "Defect confirmed, part scrapped",
        rework: "Sent to rework and 100% sort of the batch",
        concession: "Customer concession approved for this lot",
        abandoned: "Check abandoned",
      };
      const wait = (10 + r() * 30) * 60;
      push({ type: "hold_decision", did: did("s1"), outcome, by, reason: reasons[outcome], decidedAt: t + wait * SEC - 60 * SEC }, wait);
    }
  };

  for (const s of STEPS) {
    if (plan.kind === "left" && s.n === plan.atStep) {
      push({ type: "leave", reason: plan.reason, end: true }, 120);
      return actions;
    }
    if ((plan.kind === "ended" || plan.kind === "open_stop") && s.n === plan.issueStep) {
      // A few points tried (if the step has any), then the problem is seen and lodged.
      for (const p of s.points.slice(0, 3)) push({ type: "tap_point", step: s.n, point: p }, dur(s.n));
      stopAndDecide(s.n, plan.issue, plan.kind === "ended" ? plan.outcome : null);
      return actions;
    }
    if (extra.pauseAtStep === s.n) {
      push({ type: "pause" }, 30);
      push({ type: "resume" }, (3 + r() * 5) * 60);
    }
    lodgeHere(s.n);
    fixHere(s.n);

    const skip = plan.kind === "skip" && plan.step === s.n ? plan.missing
      : plan.kind === "skip_and_clamp" && s.n === 7 ? plan.missing : null;
    const clamp = plan.kind === "clamp" && plan.step === s.n ? plan
      : plan.kind === "skip_and_clamp" && s.n === 5 ? { tapped: "C4", expected: "C3" } : null;

    if (!s.points.length) {
      push({ type: "next_step", step: s.n }, dur(s.n));
      continue;
    }
    if (clamp) {
      const before = s.points.slice(0, s.points.indexOf(clamp.expected));
      for (const p of before) push({ type: "tap_point", step: s.n, point: p }, dur(s.n));
      push({ type: "tap_point", step: s.n, point: clamp.tapped }, dur(s.n)); // wrong order: a deviation
      push({ type: "release_clamps", step: s.n }, 25);
      for (const p of s.points) push({ type: "tap_point", step: s.n, point: p }, dur(s.n));
      push({ type: "fix_continue", deviation: actions.find((a) => a.type === "tap_point" && a.step === s.n && a.point === clamp.tapped)!.id }, 8);
      continue;
    }
    for (const p of s.points) if (!skip?.includes(p)) push({ type: "tap_point", step: s.n, point: p }, dur(s.n));
    push({ type: "next_step", step: s.n }, 10);
    if (skip) {
      const raiser = actions[actions.length - 1].id;
      for (const p of skip) push({ type: "tap_point", step: s.n, point: p }, 20 + dur(s.n));
      push({ type: "fix_continue", deviation: raiser }, 8);
    }
  }
  return actions;
}
