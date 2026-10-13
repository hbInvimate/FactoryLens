// Plain-language lines for deviations. Short sentences, feature IDs only.
import { capitalize, describePoints, missingVerb, step } from "@/lib/sop";
import type { Deviation } from "./types";

const MUST: Record<number, string> = {
  5: "Clamps must close in order, C1 to C6.",
  6: "Clamps must close in order, C1 to C6.",
  7: "A check pin must be tried at every hole.",
  8: "A gauge or pin must be applied at each slot and notch.",
  9: "A gauge must be placed at every trim edge point.",
  10: "A gauge must be used at each flange point.",
  11: "The whole part must be looked over, V1 to V5.",
};

export interface DeviationText {
  /** Banner: "Step 7 skipped" */
  title: string;
  /** Banner: "Holes H9 to H12 not checked" */
  sub: string;
  /** The large spoken correction. */
  correction: string;
  /** Under her view. */
  detail: string;
  /** History line: "Step 7: holes H9 to H12 not checked" */
  log: string;
  must: string;
}

export function deviationText(d: Deviation): DeviationText {
  if (d.kind === "wrong_order") {
    return {
      title: `Step ${d.step}: wrong order`,
      sub: `Clamp ${d.tapped} closed before ${d.expected}`,
      correction: `Step ${d.step}: close ${d.expected} before ${d.tapped}.`,
      detail: `Clamp ${d.tapped} was closed before ${d.expected}.`,
      log: `Step ${d.step}: clamp ${d.tapped} closed before ${d.expected}`,
      must: MUST[d.step] ?? "",
    };
  }
  const pts = describePoints(d.missing);
  const verb = missingVerb(d.step);
  const doing = step(d.step).ordered ? "closing" : "checking";
  return {
    title: `Step ${d.step} skipped`,
    sub: capitalize(`${pts} ${verb}`),
    correction: `Go back to Step ${d.step}: ${step(d.step).pointSet}.`,
    detail: `The Quality Technician moved on without ${doing} ${pts}.`,
    log: `Step ${d.step}: ${pts} ${verb}`,
    must: MUST[d.step] ?? "",
  };
}

export function fixedLine(d: Deviation): string {
  if (d.fixedAt === null) return d.trainerCalledAt ? "Trainer called. Not fixed yet" : "Not fixed yet";
  const retries = d.failed;
  const base = retries === 1 ? "Corrected on the first retry" : `Corrected after ${retries} failed attempts`;
  return d.trainerCalledAt ? `${base}, with a trainer` : base;
}
