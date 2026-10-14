// Which points were missed when a step was skipped.
// New events store the IDs (step_events.points). For older rows, work them out from the point confirmations:
// the points of that step not confirmed before the skip. If that does not add up, say "not recorded".
import { step as sopStep } from "@/lib/sop";

export interface EventLike {
  step: number;
  kind: string;
  at: Date;
  points: string[] | null;
}

export interface ConfirmationLike {
  step: number;
  pointId: string;
  confirmedAt: Date;
}

/** Missed point IDs of a skipped-step event, or null when they cannot be known ("not recorded"). */
export function missedPoints(e: EventLike, confirmations: ConfirmationLike[]): string[] | null {
  if (e.kind !== "skipped") return null;
  if (e.points?.length) return e.points;
  const all = sopStep(e.step).points;
  if (!all.length) return null;
  const forStep = confirmations.filter((c) => c.step === e.step);
  // No confirmations at all for that step: the data is not there, so do not claim every point was missed.
  if (!forStep.length) return null;
  const before = new Set(forStep.filter((c) => c.confirmedAt.getTime() <= e.at.getTime()).map((c) => c.pointId));
  const missed = all.filter((p) => !before.has(p));
  return missed.length ? missed : null;
}
