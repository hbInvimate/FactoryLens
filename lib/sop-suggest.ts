// "Review this way": compare a candidate's checks with the Active SOP, step by step, and propose changes
// (one-click-flow.md part 2). Deterministic, no model. It proposes; the Quality Engineer decides. It never
// changes the 12 steps or the check points: TIME changes a target CT, ORDER adds a note to "What to do".
import { CT_ROUND_UP_SECONDS, REALISTIC_FASTER_THAN_PERCENT } from "@/lib/config";
import { STEPS } from "@/lib/sop";
import { CANDIDATE_SETTINGS, type CandidateSettings, type CheckRow } from "@/lib/sop-candidates";
import type { StepText } from "@/lib/sop-revisions";
import { mmss, percentile } from "@/lib/sop-stats";

export type SuggestionType = "time" | "order";

export interface ProposedChange {
  step: number;
  type: SuggestionType;
  /** time: seconds as text, or null when no target is set. order: the current "What to do". */
  oldValue: string | null;
  newValue: string;
  why: string;
  warning: string | null;
  detail: Record<string, unknown>;
  sourceSessionIds: string[];
}

export interface Comparison {
  changes: ProposedChange[];
  /** Steps with no clear difference. */
  noChange: number[];
  /** Where each step is in the candidate's latest check, for the clip references. */
  clips: { sessionId: string; step: number; startSecond: number; endSecond: number }[];
}

export const roundUp = (seconds: number, to = CT_ROUND_UP_SECONDS) => Math.ceil(seconds / to) * to;

const NOUN: Record<string, string> = { H: "holes", S: "slots", N: "notches", T: "trim points", F: "flange points", V: "visual points", C: "clamps" };
const num = (id: string) => parseInt(id.slice(1), 10);

/** A plain sentence for the order the candidate uses. */
export function describeOrder(standard: string[], used: string[]): string {
  const prefixes = new Set(standard.map((p) => p[0]));
  const noun = prefixes.size === 1 ? NOUN[[...prefixes][0]] ?? "points" : "points";
  const odd = standard.filter((p) => num(p) % 2 === 1);
  const even = standard.filter((p) => num(p) % 2 === 0);
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  const short = (xs: string[]) => (xs.length > 3 ? `${xs[0]}, ${xs[1]} … ${xs[xs.length - 1]}` : xs.join(", "));
  if (prefixes.size === 1 && same(used, [...odd, ...even])) {
    return `Check the odd-numbered ${noun} first (${short(odd)}), then the even ones (${short(even)}).`;
  }
  if (prefixes.size === 1 && same(used, [...even, ...odd])) {
    return `Check the even-numbered ${noun} first (${short(even)}), then the odd ones (${short(odd)}).`;
  }
  if (same(used, [...standard].reverse())) return `Check the ${noun} in reverse order, ${standard[standard.length - 1]} down to ${standard[0]}.`;
  return `Check the ${noun} in this order: ${used.join(", ")}.`;
}

/**
 * For each of the 12 steps:
 * - TIME when the candidate's median step time beats the reference (Active target, else the station median)
 *   by the margin in percent and seconds, in at least the share of their checks. New CT = that median rounded
 *   up to the next 5 seconds. A warning when it is faster than 90% of all completed checks at the station.
 * - ORDER when the order the points are confirmed in differs from the standard order in at least the share
 *   of their checks: a note for "What to do" in the candidate's (most common) order. Never for ordered steps.
 * Only checks with the step correct on the first attempt are used; the share is out of all their checks.
 */
export function compare(
  candidate: CheckRow[],
  station: CheckRow[],
  active: StepText[],
  s: CandidateSettings = CANDIDATE_SETTINGS,
  realisticPercent = REALISTIC_FASTER_THAN_PERCENT,
): Comparison {
  const real = station.filter((r) => !r.isSample);
  const checks = candidate.filter((r) => !r.isSample);
  const changes: ProposedChange[] = [];
  const noChange: number[] = [];
  const n = checks.length;

  for (const st of STEPS) {
    const i = st.n - 1;
    const target = active[i]?.targetCtSeconds ?? null;
    const stationTimes = real.map((r) => r.stepSeconds[i]).filter((x): x is number => x !== null);
    const stationMedian = percentile(stationTimes, 0.5);
    const ref = target ?? stationMedian;
    const correct = checks.filter((c) => c.correct[i] && c.stepSeconds[i] !== null);
    const ids = correct.map((c) => c.id);
    let changed = false;

    if (ref !== null && n > 0 && correct.length) {
      const faster = correct.filter((c) => {
        const t = c.stepSeconds[i] as number;
        return t <= ref * (1 - s.stepMinPercent / 100) && ref - t >= s.stepMinSeconds;
      });
      const share = (faster.length / n) * 100;
      const median = percentile(correct.map((c) => c.stepSeconds[i] as number), 0.5) as number;
      const newCt = roundUp(median);
      if (share >= s.sharePercent && newCt < ref) {
        const slower = stationTimes.filter((t) => t > newCt).length;
        const slowerShare = stationTimes.length ? (slower / stationTimes.length) * 100 : 0;
        const basis = target !== null ? `the target ${mmss(target)}` : `the station median ${mmss(Math.round(stationMedian as number))}`;
        changes.push({
          step: st.n,
          type: "time",
          oldValue: target === null ? null : String(target),
          newValue: String(newCt),
          why: `${faster.length} of ${n} checks were faster than ${basis} by at least ${s.stepMinPercent}% and ${s.stepMinSeconds} s. Their median ${mmss(Math.round(median))}, rounded up to ${mmss(newCt)}.`,
          warning: slowerShare >= realisticPercent ? `New CT is faster than ${Math.floor(slowerShare)}% of the checks at this station. Check it is realistic.` : null,
          detail: {
            reference: target !== null ? "target" : "station median",
            referenceSeconds: target ?? Math.round(stationMedian as number),
            candidateMedianSeconds: median,
            fasterChecks: faster.length,
            checks: n,
            sharePercent: Math.round(share),
            stationChecks: stationTimes.length,
            stationSlowerPercent: Math.round(slowerShare),
            roundedUpTo: CT_ROUND_UP_SECONDS,
          },
          sourceSessionIds: ids,
        });
        changed = true;
      }
    }

    if (st.points.length > 1 && !st.ordered && n > 0) {
      const differs = correct.filter((c) => c.orders[i].length === st.points.length && c.orders[i].some((p, k) => p !== st.points[k]));
      const share = (differs.length / n) * 100;
      if (share >= s.sharePercent) {
        const counts = new Map<string, number>();
        for (const c of differs) counts.set(c.orders[i].join(","), (counts.get(c.orders[i].join(",")) ?? 0) + 1);
        const [mode, modeCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
        const note = describeOrder(st.points, mode.split(","));
        const old = active[i]?.todo ?? st.todo;
        changes.push({
          step: st.n,
          type: "order",
          oldValue: old,
          newValue: `${old} ${note}`,
          why: `${differs.length} of ${n} checks confirmed the points (${st.pointSet || "this step"}) in another order than the SOP lists (${modeCount} the same way). This only adds a note to "What to do"; the check points stay the same.`,
          warning: null,
          detail: { differs: differs.length, checks: n, sharePercent: Math.round(share), order: mode.split(","), standard: st.points },
          sourceSessionIds: differs.map((c) => c.id),
        });
        changed = true;
      }
    }
    if (!changed) noChange.push(st.n);
  }

  const latest = [...checks].sort((a, b) => b.startedAt - a.startedAt)[0];
  const clips = latest
    ? latest.windows.flatMap((w, i) => (w ? [{ sessionId: latest.id, step: i + 1, startSecond: w[0], endSecond: w[1] }] : []))
    : [];
  return { changes, noChange, clips };
}
