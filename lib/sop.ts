// The SOP: first-off check of the B-pillar outer. Exactly 12 steps (docs/sop.md).
// Names and numbers are placeholders.

export type Phase = "Setup" | "Seating" | "Clamp" | "Measure" | "Release";
export type CameraView = "Camera can see this step" | "Camera sees this step partly";

export interface SopStep {
  n: number;
  name: string;
  short: string;
  phase: Phase;
  spoken: string;
  todo: string;
  correct: string;
  mistake: string;
  rule: string;
  camera: CameraView;
  /** Point ids the Quality Technician taps, in SOP order. Empty: single confirmation. */
  points: string[];
  /** Points must be tapped in this exact order (clamps). */
  ordered: boolean;
  /** Seating points (A1 to A5) that count as covered when this single-confirmation step is done. */
  seating: string[];
  /** Short name of the full point set, used in corrections: "Holes H1 to H14". */
  pointSet: string;
}

const range = (prefix: string, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${from + i}`);

const CLAMPS = range("C", 1, 6);

export const STEPS: SopStep[] = [
  {
    n: 1, name: "Confirm part, fixture and SOP", short: "Part, fixture, SOP", phase: "Setup",
    spoken: "Step 1 — Confirm the part, fixture and SOP.",
    todo: "Check the part number and fixture ID match the job and the SOP revision shown.",
    correct: "Part B-pillar outer on fixture FX-014, SOP rev shown on screen.",
    mistake: "Starting on the wrong part, fixture or SOP revision.", rule: "The part, fixture and SOP revision must match the job before anything else.",
    camera: "Camera can see this step", points: [], ordered: false, seating: [], pointSet: "",
  },
  {
    n: 2, name: "Clean the pads and pins", short: "Clean fixture", phase: "Setup",
    spoken: "Step 2 — Clean the pads and pins.",
    todo: "Wipe the pads and pins. No swarf, dross or coating dust.",
    correct: "Pads and pins wiped and clear.",
    mistake: "Loading the part on a dirty fixture.", rule: "Dirt on pads or pins causes false readings.",
    camera: "Camera sees this step partly", points: [], ordered: false, seating: [], pointSet: "",
  },
  {
    n: 3, name: "Lower the part onto pads P1 to P3", short: "Onto the pads", phase: "Seating",
    spoken: "Step 3 — Lower the part onto the pads.",
    todo: "Lower the part onto pads P1, P2 and P3 first.",
    correct: "The part rests on all three pads before it touches the pins.",
    mistake: "Engaging the pins before the pads.", rule: "",
    camera: "Camera can see this step", points: [], ordered: false, seating: range("A", 1, 3), pointSet: "",
  },
  {
    n: 4, name: "Round pin, then slot pin, no force", short: "Engage pins", phase: "Seating",
    spoken: "Step 4 — Round pin first. No force.",
    todo: "Slide the part until the round pin enters RPS-1, then the slot pin enters RPS-2.",
    correct: "Pins enter in that order with no force.",
    mistake: "Slot pin first, or pushing the part into place.",
    rule: "Never force the part. Forcing bends it and creates false deviations.",
    camera: "Camera sees this step partly", points: [], ordered: false, seating: range("A", 4, 5), pointSet: "",
  },
  {
    n: 5, name: "Close clamps lightly, C1 to C6", short: "Clamp lightly", phase: "Clamp",
    spoken: "Step 5 — Close clamps in order, C1 to C6.",
    todo: "Close clamps C1 to C6 lightly, one at a time.",
    correct: "Clamps close in order, one at a time. The part already sits on the pads and pins.",
    mistake: "Wrong order, or two clamps at once.",
    rule: "Never use a clamp to pull the part into place. Release and reseat it.",
    camera: "Camera can see this step", points: CLAMPS, ordered: true, seating: [], pointSet: "Clamps C1 to C6",
  },
  {
    n: 6, name: "Close clamps fully, same order", short: "Clamp fully", phase: "Clamp",
    spoken: "Step 6 — Close clamps fully, same order.",
    todo: "Close the clamps fully, in the same order, C1 to C6.",
    correct: "Clamps close in order, one at a time.",
    mistake: "Wrong order, or a clamp pulling the part down.",
    rule: "Never use a clamp to pull the part into place.",
    camera: "Camera can see this step", points: CLAMPS, ordered: true, seating: [], pointSet: "Clamps C1 to C6",
  },
  {
    n: 7, name: "Check holes H1 to H14 with check pins", short: "Holes H1–H14", phase: "Measure",
    spoken: "Step 7 — Check the holes, H1 to H14.",
    todo: "Try a check pin at every hole, H1 to H14, in order. Enter each reading on the tablet.",
    correct: "A check pin tried at every hole, in order.",
    mistake: "A hole is skipped.", rule: "Readings are entered on the tablet, not here.",
    camera: "Camera can see this step", points: range("H", 1, 14), ordered: false, seating: [], pointSet: "Holes H1 to H14",
  },
  {
    n: 8, name: "Check slots and notches", short: "Slots, notches", phase: "Measure",
    spoken: "Step 8 — Check slots and notches.",
    todo: "Check slots S1 to S4 and notches N1 to N4 with the gauge or pin.",
    correct: "A gauge or pin applied at each feature.",
    mistake: "A feature is skipped.", rule: "Readings are entered on the tablet, not here.",
    camera: "Camera can see this step", points: [...range("S", 1, 4), ...range("N", 1, 4)], ordered: false, seating: [],
    pointSet: "Slots S1 to S4 and notches N1 to N4",
  },
  {
    n: 9, name: "Check trim edges T1 to T14", short: "Trim edges", phase: "Measure",
    spoken: "Step 9 — Check trim edges T1 to T14.",
    todo: "Place the flush pin or contour gauge at every point, T1 to T14.",
    correct: "A gauge at every point along each edge.",
    mistake: "A point is skipped.", rule: "Readings are entered on the tablet, not here.",
    camera: "Camera can see this step", points: range("T", 1, 14), ordered: false, seating: [], pointSet: "Trim edges T1 to T14",
  },
  {
    n: 10, name: "Check flange gaps F1 to F4", short: "Flange form", phase: "Measure",
    spoken: "Step 10 — Check flange gaps F1 to F4.",
    todo: "Use the taper gauge at each of the four flange points, F1 to F4.",
    correct: "A gauge at each of the four points.",
    mistake: "A point is skipped.", rule: "Readings are entered on the tablet, not here.",
    camera: "Camera can see this step", points: range("F", 1, 4), ordered: false, seating: [], pointSet: "Flange gaps F1 to F4",
  },
  {
    n: 11, name: "Look over the whole part", short: "Visual check", phase: "Measure",
    spoken: "Step 11 — Look over the whole part.",
    todo: "Look over the whole part: trim edges, surface and marking (V1 to V5).",
    correct: "The whole trim, surface and marking looked over.",
    mistake: "A quick glance, one side only.", rule: "",
    camera: "Camera sees this step partly", points: range("V", 1, 5), ordered: false, seating: [], pointSet: "Visual points V1 to V5",
  },
  {
    n: 12, name: "Release clamps, C6 to C1", short: "Release clamps", phase: "Release",
    spoken: "Step 12 — Release clamps, C6 to C1.",
    todo: "Release the clamps in reverse order, C6 down to C1. Remove, rack and tag the part.",
    correct: "C6 down to C1, then the part racked and tagged.",
    mistake: "Wrong order, or the part left untagged.", rule: "",
    camera: "Camera can see this step", points: [], ordered: false, seating: [], pointSet: "",
  },
];

export const STEP_COUNT = 12;
/** 5 seating + 14 holes + 8 slots and notches + 14 trim + 4 flange + 5 visual. */
export const TOTAL_CHECK_POINTS = 50;

export const SESSION_DEFAULTS = {
  part: "B-pillar outer",
  sop: "First-off check, rev A",
  fixture: "Laser cell 3 · FX-014",
  operator: "QT-07 (sample)",
};

export function step(n: number): SopStep {
  const s = STEPS[n - 1];
  if (!s) throw new Error(`No step ${n}`);
  return s;
}

/** Clamp points are confirmations, not check points; everything from step 7 on is. */
export function countsAsCheckPoint(stepN: number): boolean {
  return stepN >= 7 && stepN <= 11;
}

export function stepLabel(n: number): string {
  return n === 0 ? "Not about a step" : `Step ${n}: ${step(n).name}`;
}

const NOUNS: Record<string, [string, string]> = {
  C: ["clamp", "clamps"],
  H: ["hole", "holes"],
  S: ["slot", "slots"],
  N: ["notch", "notches"],
  T: ["trim edge", "trim edges"],
  F: ["flange gap", "flange gaps"],
  V: ["visual point", "visual points"],
};

const num = (id: string) => parseInt(id.slice(1), 10);

/** "H9 to H12", "H3, H9 to H12". Ids must share a prefix. */
export function compressIds(ids: string[]): string {
  const sorted = [...ids].sort((a, b) => num(a) - num(b));
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && num(sorted[j + 1]) === num(sorted[j]) + 1) j++;
    parts.push(j > i ? `${sorted[i]} to ${sorted[j]}` : sorted[i]);
    i = j + 1;
  }
  return parts.join(", ");
}

/** "holes H9 to H12", "slot S2, notches N1 to N4". */
export function describePoints(ids: string[]): string {
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const p = id[0];
    groups.set(p, [...(groups.get(p) ?? []), id]);
  }
  return [...groups.entries()]
    .map(([p, list]) => {
      const [one, many] = NOUNS[p] ?? ["point", "points"];
      return `${list.length === 1 ? one : many} ${compressIds(list)}`;
    })
    .join(", ");
}

export function missingVerb(stepN: number): string {
  return step(stepN).ordered ? "not closed" : "not checked";
}

export const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
