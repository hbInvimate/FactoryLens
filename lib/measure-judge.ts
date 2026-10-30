// Measurements page only: each value against the SOP tolerance (lib/config.ts), point groups, trends and drift.
// Pure, so the server page and the browser table share it.
import { MEASUREMENT_TOLERANCES, NEAR_LIMIT_SHARE } from "@/lib/config";
import { STEPS } from "@/lib/sop";

export type Judgement = "in" | "near" | "out";

export function toleranceOf(point: string): { nominal: number; tol: number } | null {
  return MEASUREMENT_TOLERANCES[point[0] as keyof typeof MEASUREMENT_TOLERANCES] ?? null;
}

/** Green inside, amber within NEAR_LIMIT_SHARE of the tolerance from a limit, red outside. */
export function judge(point: string, value: number): Judgement | null {
  const t = toleranceOf(point);
  if (!t) return null;
  const off = Math.abs(value - t.nominal);
  // Rounded to the 0.001 mm, so 8.05 against 8.00 ± 0.05 is on the limit, not over it by float noise.
  const d = Math.round((t.tol - off) * 1000) / 1000;
  if (d < 0) return "out";
  return d <= Math.round(t.tol * NEAR_LIMIT_SHARE * 1000) / 1000 ? "near" : "in";
}

export const POINT_GROUPS = [
  { id: "holes", label: "Holes", points: STEPS[6].points },
  { id: "slots", label: "Slots", points: STEPS[7].points },
  { id: "trim", label: "Trim edges", points: STEPS[8].points },
  { id: "flange", label: "Flange gaps", points: STEPS[9].points },
] as const;
export type PointGroupId = (typeof POINT_GROUPS)[number]["id"];

export const groupLabel = (id: PointGroupId) => {
  const g = POINT_GROUPS.find((x) => x.id === id)!;
  return `${g.label} ${g.points[0]}–${g.points[g.points.length - 1]}`;
};

/** What to look at first when a point drifts, by feature. A suggestion, never a diagnosis. */
const CAUSE: Record<string, string> = {
  H: "check pin or locator wear",
  S: "slot gauge or pin wear",
  N: "notch gauge or pin wear",
  T: "laser trim offset",
  F: "flange forming or clamp pressure",
};
export const likelyCause = (point: string) => CAUSE[point[0]] ?? "the fixture";

/** A point's values, oldest first. */
export type Series = { value: number; at: string; sessionId: string }[];

/** The same direction over the last checks (at least 3 in a row), or null. */
export function drift(series: Series): { dir: "up" | "down"; from: number; to: number; n: number } | null {
  if (series.length < 3) return null;
  let n = 1;
  let dir: "up" | "down" | null = null;
  for (let i = series.length - 1; i > 0; i--) {
    const d = series[i].value - series[i - 1].value;
    const here = d > 0 ? "up" : d < 0 ? "down" : null;
    if (!here || (dir && here !== dir)) break;
    dir = here;
    n++;
  }
  if (!dir || n < 3) return null;
  return { dir, from: series[series.length - n].value, to: series[series.length - 1].value, n };
}
