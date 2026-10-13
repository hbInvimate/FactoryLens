// The 54-issue catalogue. Single source of truth: docs/issues.json.
import raw from "@/docs/issues.json";

export type IssueKind = "self" | "try" | "lodge";
export type IssueEffect = "stop" | "continue";

export interface Issue {
  label: string;
  kind: IssueKind;
  fix: string[];
  who: string[];
  effect: IssueEffect;
  note: string;
}

function load(): Record<number, Issue[]> {
  const out: Record<number, Issue[]> = {};
  for (const [key, list] of Object.entries(raw as Record<string, unknown[]>)) {
    out[Number(key)] = list.map((x) => {
      const i = x as Issue;
      if (!["self", "try", "lodge"].includes(i.kind) || !["stop", "continue"].includes(i.effect)) {
        throw new Error(`Bad issue in docs/issues.json: ${i.label}`);
      }
      return i;
    });
  }
  return out;
}

export const ISSUES = load();

/** Issues for a step; 0 is "Not about a step". */
export function issuesFor(stepN: number): Issue[] {
  return ISSUES[stepN] ?? [];
}

export function findIssue(stepN: number, label: string): Issue | undefined {
  return issuesFor(stepN).find((i) => i.label === label);
}

export const KIND_LABEL: Record<IssueKind, string> = {
  self: "Fix it yourself",
  try: "Try a fix, then lodge",
  lodge: "Lodge and call",
};

/** Issues whose lodged screen offers the hole check procedure (the H5 to H8 case). */
const HOLE_PROCEDURE = new Set([
  "7|Several holes will not take the pin, same direction",
  "7|Check pin will not enter one hole",
]);

export function opensHoleProcedure(stepN: number, label: string): boolean {
  return HOLE_PROCEDURE.has(`${stepN}|${label}`);
}

export const STOP_TODO = [
  "Do not force anything",
  "Keep the part clamped",
  "Do not measure anything else until someone arrives",
  "Take photos of the problem",
];

export const CONTINUE_TODO = [
  "Do not force anything",
  "Keep the part clamped",
  "Carry on with the other checks. Record everything on the tablet",
  "Take photos of the problem",
];
