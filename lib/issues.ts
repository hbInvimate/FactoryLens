// The issue catalogue (54 in use, 2 retired). Single source of truth: docs/issues.json, categories from docs/dashboard/issue_categories.json.
import raw from "@/docs/issues.json";
import categoriesRaw from "@/docs/dashboard/issue_categories.json";

const CATEGORY = new Map(
  (categoriesRaw as { issues: { step: number; label: string; category: string }[] }).issues.map((c) => [`${c.step}|${c.label}`, c.category]),
);
export const CATEGORIES: string[] = (categoriesRaw as { categories: string[] }).categories;

/** The issue's category for the dashboard. "Other" if it has none. */
export function categoryOf(stepN: number, label: string): string {
  return CATEGORY.get(`${stepN}|${label}`) ?? "Other";
}

export type IssueKind = "self" | "try" | "lodge";
export type IssueEffect = "stop" | "continue";

export interface Issue {
  label: string;
  kind: IssueKind;
  fix: string[];
  who: string[];
  effect: IssueEffect;
  note: string;
  /** From docs/dashboard/issue_categories.json. */
  category: string;
  /** No longer offered (the old step 1 glove issues). Kept so past checks that used it still rebuild. */
  retired?: boolean;
}

function load(): Record<number, Issue[]> {
  const out: Record<number, Issue[]> = {};
  for (const [key, list] of Object.entries(raw as Record<string, unknown[]>)) {
    out[Number(key)] = list.map((x) => {
      const i = x as Omit<Issue, "category">;
      if (!["self", "try", "lodge"].includes(i.kind) || !["stop", "continue"].includes(i.effect)) {
        throw new Error(`Bad issue in docs/issues.json: ${i.label}`);
      }
      return { ...i, category: categoryOf(Number(key), i.label) };
    });
  }
  return out;
}

export const ISSUES = load();

/** Issues for a step; 0 is "Not about a step". */
export function issuesFor(stepN: number): Issue[] {
  return (ISSUES[stepN] ?? []).filter((i) => !i.retired);
}

/** Retired issues too: a past check that lodged one must still rebuild the same. */
export function findIssue(stepN: number, label: string): Issue | undefined {
  return (ISSUES[stepN] ?? []).find((i) => i.label === label);
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
