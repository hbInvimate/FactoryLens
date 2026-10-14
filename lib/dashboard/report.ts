// What the single-session report shows ("What went wrong", "Discrepancies lodged").
// Pure: built from the session state (rebuilt from its log) and the rows stored for it.
// Missed points come from what was stored with the event; older rows fall back to the point
// confirmations, and if that does not add up the card says "points not recorded". Never a guess.
import { activeAt } from "@/lib/check/reducer";
import { HOLD_OUTCOMES, type CheckState, type Discrepancy } from "@/lib/check/types";
import { missedPoints, type ConfirmationLike, type EventLike } from "@/lib/dashboard/missed";
import { capitalize, step as sopStep } from "@/lib/sop";

export type DeviationType = "skipped" | "wrong_order" | "cannot_do";

export const TYPE_LABEL: Record<DeviationType, string> = {
  skipped: "step skipped",
  wrong_order: "wrong order",
  cannot_do: "cannot do",
};

export interface Clip {
  /** The step's points, in SOP order. */
  points: string[];
  /** Clamps (square tiles, order matters). */
  ordered: boolean;
  /** The technician's version: missed points, or the clamp closed too early. */
  missing: string[];
  wrong: string | null;
  expected: string | null;
}

export interface DeviationCard {
  key: string;
  at: number;
  /** Time into the session, without paused time, in ms. */
  sessionMs: number;
  step: number;
  stepName: string;
  type: DeviationType;
  happened: string;
  expected: string;
  /** Missed points (skipped) or [closed, expected] (wrong order). Null: not recorded. */
  points: string[] | null;
  /** Failed attempts on this step (the mistake itself is attempt 1). Null for "cannot do". */
  attempts: number | null;
  corrected: boolean | null;
  trainerCalled: boolean;
  clip: Clip | null;
}

const NOUNS: Record<string, [string, string]> = {
  C: ["Clamp", "Clamps"],
  H: ["Hole", "Holes"],
  S: ["Slot", "Slots"],
  N: ["Notch", "Notches"],
  T: ["Trim edge point", "Trim edge points"],
  F: ["Flange point", "Flange points"],
  V: ["Visual point", "Visual points"],
};

/** "Holes H9, H10, H11, H12"; "Slot S2, notches N1, N2". Every ID is named. */
export function listPoints(ids: string[]): string {
  const groups = new Map<string, string[]>();
  for (const id of ids) groups.set(id[0], [...(groups.get(id[0]) ?? []), id]);
  return [...groups.entries()]
    .map(([p, list], i) => {
      const [one, many] = NOUNS[p] ?? ["Point", "Points"];
      const noun = list.length === 1 ? one : many;
      return `${i === 0 ? noun : noun.toLowerCase()} ${list.join(", ")}`;
    })
    .join(", ");
}

export interface StoredEvent extends EventLike {
  attempt: number;
  detail: string;
}

export function deviationCards(s: CheckState, events: StoredEvent[], confirmations: ConfirmationLike[]): DeviationCard[] {
  const cards: DeviationCard[] = s.deviations.map((d) => {
    const def = sopStep(d.step);
    const stored = events.find((e) => e.step === d.step && e.kind === d.kind && e.attempt === 1);
    let points: string[] | null;
    let happened: string;
    let clip: Clip | null;
    if (d.kind === "skipped") {
      points = stored ? missedPoints(stored, confirmations) : d.missing.length ? d.missing : null;
      const verb = def.ordered ? "not closed" : "not checked";
      happened = points ? `${listPoints(points)} ${verb}` : "Points not recorded";
      clip = points ? { points: def.points, ordered: def.ordered, missing: points, wrong: null, expected: null } : null;
    } else {
      // The clamps are known from the log itself: the one closed, and the one that should have been.
      const pair = stored?.points?.length === 2 ? stored.points : d.tapped && d.expected ? [d.tapped, d.expected] : null;
      points = pair;
      happened = pair ? `Clamp ${pair[0]} closed before ${pair[1]}` : "Points not recorded";
      clip = pair ? { points: def.points, ordered: true, missing: [], wrong: pair[0], expected: pair[1] } : null;
    }
    return {
      key: d.id,
      at: d.raisedAt,
      sessionMs: activeAt(s, d.raisedAt),
      step: d.step,
      stepName: def.name,
      type: d.kind,
      happened,
      expected: def.correct,
      points,
      attempts: d.failed,
      corrected: d.fixedAt !== null,
      trainerCalled: d.trainerCalledAt !== null,
      clip,
    };
  });

  // "Cannot do": the check was stopped at a step by a problem with the part or fixture.
  for (const e of s.stepEvents) {
    if (e.kind !== "cannot_do" || !e.detail.startsWith("Stopped:")) continue;
    cards.push({
      key: e.id,
      at: e.at,
      sessionMs: activeAt(s, e.at),
      step: e.step,
      stepName: sopStep(e.step).name,
      type: "cannot_do",
      happened: `The check was stopped. ${e.detail.replace(/^Stopped:\s*/, "")}`,
      expected: "The step could not be done. The decision is recorded in the hold below.",
      points: null,
      attempts: null,
      corrected: null,
      trainerCalled: false,
      clip: null,
    });
  }
  return cards.sort((a, b) => a.at - b.at);
}

// ---------- discrepancies ----------

export interface DiscrepancyCard {
  key: string;
  step: number;
  stepName: string;
  issue: string;
  category: string;
  loggedAt: number;
  sessionMs: number;
  who: string[];
  called: string[];
  stopped: boolean;
  fixedOnSpot: boolean;
  outcome: string;
}

/** The outcome of a lodged issue, in the words of the list: fixed on the spot, cleared, part held, scrapped, rework, concession. */
export function outcomeOf(d: Discrepancy): string {
  if (d.status === "fixed_on_spot") return "Fixed on the spot";
  if (d.decision) return HOLD_OUTCOMES.find((o) => o.id === d.decision!.outcome)?.label ?? d.decision.outcome;
  switch (d.status) {
    case "open":
      return "Open, waiting for a decision";
    case "escalated":
      return "Escalated, waiting for a decision";
    case "released":
      return "Released after a trial part passed";
    case "cleared":
    case "scrapped":
      // Before hold decisions, a stop that was cleared or scrapped ended the session as part held.
      return d.effect === "stop" ? `Part held (${d.status === "scrapped" ? "scrapped" : "cleared"})` : capitalize(d.status);
    default:
      return capitalize(d.status);
  }
}

export function discrepancyCards(s: CheckState): DiscrepancyCard[] {
  return [...s.discrepancies]
    .sort((a, b) => a.loggedAt - b.loggedAt)
    .map((d) => ({
      key: d.id,
      step: d.step,
      stepName: d.step ? sopStep(d.step).name : "Not about a step",
      issue: d.issue,
      category: d.category,
      loggedAt: d.loggedAt,
      sessionMs: activeAt(s, d.loggedAt),
      who: d.who,
      called: d.called,
      stopped: d.effect === "stop",
      fixedOnSpot: d.status === "fixed_on_spot",
      outcome: outcomeOf(d),
    }));
}
