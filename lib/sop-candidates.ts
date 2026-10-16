// "Ways of working worth a look" (docs/sop-management/one-click-flow.md, part 1). Pure and deterministic:
// no model. A Quality Technician is listed when their newest completed checks are ALL faster than the
// station median by the set margin, and their first-time-correct rate is not below the station's.
// Real sessions only: a sample session is never part of a candidate.
import { activeCheckMs, correctFirstTime, reduce, stepActiveMs } from "@/lib/check/reducer";
import {
  CANDIDATE_MIN_CHECKS, CANDIDATE_MIN_IMPROVEMENT_PERCENT, STEP_CHANGE_MIN_PERCENT, STEP_CHANGE_MIN_SECONDS, STEP_CHANGE_SHARE_PERCENT,
} from "@/lib/config";
import { percentile, type StatSession } from "@/lib/sop-stats";

export interface CandidateSettings {
  minChecks: number;
  minImprovementPercent: number;
  stepMinPercent: number;
  stepMinSeconds: number;
  sharePercent: number;
}

export const CANDIDATE_SETTINGS: CandidateSettings = {
  minChecks: CANDIDATE_MIN_CHECKS,
  minImprovementPercent: CANDIDATE_MIN_IMPROVEMENT_PERCENT,
  stepMinPercent: STEP_CHANGE_MIN_PERCENT,
  stepMinSeconds: STEP_CHANGE_MIN_SECONDS,
  sharePercent: STEP_CHANGE_SHARE_PERCENT,
};

/** One completed check, reduced. */
export interface CheckRow {
  id: string;
  startedAt: number;
  isSample: boolean;
  /** Who did it: users.id, or the label for older sessions. */
  who: string;
  label: string;
  checkSeconds: number | null;
  /** Steps correct on the first attempt ÷ 12, 0 to 100. */
  conformance: number;
  stepSeconds: (number | null)[];
  correct: boolean[];
}

export function checkRows(sessions: StatSession[]): CheckRow[] {
  return sessions.map((s) => {
    const st = reduce(s.actions, s.startedAt);
    const ms = activeCheckMs(st);
    return {
      id: s.id,
      startedAt: s.startedAt,
      isSample: s.isSample,
      who: s.userId ?? `label:${s.operator}`,
      label: s.operator,
      checkSeconds: ms === null ? null : ms / 1000,
      conformance: (correctFirstTime(st) / 12) * 100,
      stepSeconds: Array.from({ length: 12 }, (_, i) => {
        const v = stepActiveMs(st, i + 1);
        return v === null ? null : v / 1000;
      }),
      correct: st.steps.map((r) => r.outcome === "correct"),
    };
  });
}

export interface Candidate {
  who: string;
  label: string;
  /** The newest checks in a row that are faster than the station median by the margin, newest first. */
  checks: CheckRow[];
  /** Their median check CT over those checks, in seconds. */
  medianSeconds: number;
  /** How much faster than the station median, in percent (12 means 12% faster). */
  fasterPercent: number;
  /** Average first-time correct over those checks, 0 to 100. */
  firstTimeCorrect: number;
  /** Steps that are faster by the step rule (the same rule "Review this way" uses for a TIME suggestion). */
  fasterSteps: number[];
}

export interface CandidateResult {
  stationMedianSeconds: number | null;
  stationFirstTimeCorrect: number | null;
  /** Median of each step over the station's checks, step 1 first. */
  stationStepMedians: (number | null)[];
  candidates: Candidate[];
  /** Everyone with completed checks: how many of their newest checks in a row are faster. For the trend card. */
  streaks: { who: string; label: string; streak: number; checks: number }[];
}

/**
 * Steps where the checks are faster than the reference (the Active target, or the station median when no
 * target is set) by at least the margin in percent AND seconds, in at least the share of the checks.
 * Only checks with the step correct on the first attempt count as faster.
 */
export function fasterSteps(checks: CheckRow[], targets: (number | null)[], stationStepMedians: (number | null)[], s: CandidateSettings = CANDIDATE_SETTINGS): number[] {
  const out: number[] = [];
  for (let i = 0; i < 12; i++) {
    const ref = targets[i] ?? stationStepMedians[i];
    if (ref === null || ref === undefined || !checks.length) continue;
    const faster = checks.filter((c) => {
      const t = c.stepSeconds[i];
      return c.correct[i] && t !== null && t <= ref * (1 - s.stepMinPercent / 100) && ref - t >= s.stepMinSeconds;
    });
    if ((faster.length / checks.length) * 100 >= s.sharePercent) out.push(i + 1);
  }
  return out;
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * `sessions`: completed checks at one station. Sample sessions are dropped here whatever the caller passes,
 * so they never make or join a candidate. `targets`: the Active revision's step targets (null: not set).
 */
export function findCandidates(sessions: StatSession[], targets: (number | null)[], s: CandidateSettings = CANDIDATE_SETTINGS): CandidateResult {
  const rows = checkRows(sessions.filter((x) => !x.isSample));
  const timed = rows.filter((r) => r.checkSeconds !== null);
  const stationMedian = percentile(timed.map((r) => r.checkSeconds as number), 0.5);
  const stationFtc = rows.length ? avg(rows.map((r) => r.conformance)) : null;
  const stationStepMedians = Array.from({ length: 12 }, (_, i) => percentile(rows.map((r) => r.stepSeconds[i]).filter((x): x is number => x !== null), 0.5));

  const byWho = new Map<string, CheckRow[]>();
  for (const r of rows) byWho.set(r.who, [...(byWho.get(r.who) ?? []), r]);

  const candidates: Candidate[] = [];
  const streaks: CandidateResult["streaks"] = [];
  if (stationMedian !== null) {
    const limit = stationMedian * (1 - s.minImprovementPercent / 100);
    for (const [who, list] of byWho) {
      const newestFirst = [...list].sort((a, b) => b.startedAt - a.startedAt);
      const streak: CheckRow[] = [];
      for (const c of newestFirst) {
        if (c.checkSeconds === null || c.checkSeconds > limit) break;
        streak.push(c);
      }
      const label = newestFirst[0].label;
      streaks.push({ who, label, streak: streak.length, checks: list.length });
      if (streak.length < s.minChecks) continue;
      const ftc = avg(streak.map((c) => c.conformance));
      if (stationFtc !== null && ftc < stationFtc) continue;
      const median = percentile(streak.map((c) => c.checkSeconds as number), 0.5) as number;
      candidates.push({
        who,
        label,
        checks: streak,
        medianSeconds: Math.round(median),
        fasterPercent: Math.round(((stationMedian - median) / stationMedian) * 100),
        firstTimeCorrect: Math.round(ftc),
        fasterSteps: fasterSteps(streak, targets, stationStepMedians, s),
      });
    }
  }
  candidates.sort((a, b) => b.fasterPercent - a.fasterPercent || b.checks.length - a.checks.length || a.label.localeCompare(b.label));
  return {
    stationMedianSeconds: stationMedian === null ? null : Math.round(stationMedian),
    stationFirstTimeCorrect: stationFtc === null ? null : Math.round(stationFtc),
    stationStepMedians,
    candidates,
    streaks,
  };
}
