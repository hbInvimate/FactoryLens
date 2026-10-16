// /dashboard/sop, c1: "Check CT trend" and "Ways of working worth a look" (one-click-flow.md part 1).
import { Card, Chip, Table, Td, Th } from "@/components/ds";
import { ReviewButton } from "./ReviewButton";
import { CANDIDATE_MIN_CHECKS, CANDIDATE_MIN_IMPROVEMENT_PERCENT } from "@/lib/config";
import type { Candidate, CheckRow } from "@/lib/sop-candidates";
import { mmss } from "@/lib/sop-stats";

const W = 520;
const H = 190;
const TOP = 28;
const BOTTOM = 18;
/** At most this many checks in the trend, the newest. */
export const TREND_CHECKS = 60;

export function TrendCard({ rows, medianSeconds, targetSeconds, highlight, sample }: {
  /** Completed checks with a check time, oldest first. Includes sample checks when the switch is on. */
  rows: CheckRow[];
  medianSeconds: number | null;
  targetSeconds: number | null;
  highlight: Candidate | null;
  sample: boolean;
}) {
  const shown = rows.slice(-TREND_CHECKS);
  const values = shown.map((r) => r.checkSeconds as number);
  const all = [...values, ...(medianSeconds === null ? [] : [medianSeconds]), ...(targetSeconds === null ? [] : [targetSeconds])];
  const lo = Math.min(...all) * 0.95;
  const hi = Math.max(...all) * 1.05;
  const x = (i: number) => (shown.length <= 1 ? W / 2 : 8 + (i * (W - 16)) / (shown.length - 1));
  const y = (v: number) => TOP + (H - TOP - BOTTOM) * (1 - (v - lo) / (hi - lo || 1));
  const line = (pts: [number, number][]) => pts.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ");
  const mine = highlight ? new Set(highlight.checks.map((c) => c.id)) : new Set<string>();
  const who = highlight?.who;
  const theirs = shown.map((r, i) => [r, i] as const).filter(([r]) => r.who === who);

  return (
    <Card className="flex min-w-0 flex-col gap-2 px-6 py-5" testId="ct-trend">
      <h2 className="text-[20px] font-semibold">Check CT trend</h2>
      <p className="text-[14px] text-muted">
        Active time per completed check, newest on the right.{sample ? " Includes SAMPLE checks." : " Real checks only."}
      </p>
      {shown.length < 2 ? (
        <p className="py-8 text-center text-[15px] text-muted" data-testid="trend-empty">
          Not enough completed checks in this view to show a trend.
        </p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Check CT of the last ${shown.length} completed checks. Station median ${mmss(medianSeconds)}.`}>
          <line x1="0" x2={W} y1={H - BOTTOM} y2={H - BOTTOM} stroke="var(--fl-border)" />
          {medianSeconds !== null && (
            <>
              <line x1="0" x2={W} y1={y(medianSeconds)} y2={y(medianSeconds)} stroke="var(--fl-text-subtle)" strokeDasharray="4 4" />
              <text x="4" y={y(medianSeconds) - 5} fontSize="11" fill="var(--fl-text-muted)">
                {mmss(medianSeconds)} station median
              </text>
            </>
          )}
          {targetSeconds !== null ? (
            <line x1="0" x2={W} y1={y(targetSeconds)} y2={y(targetSeconds)} stroke="var(--fl-primary)" strokeDasharray="6 4">
              <title>{`Target ${mmss(targetSeconds)}`}</title>
            </line>
          ) : (
            <text x={W - 4} y="12" fontSize="11" textAnchor="end" fill="var(--fl-primary-ink)">
              Target (not set yet)
            </text>
          )}
          <polyline points={line(shown.map((r, i) => [x(i), y(r.checkSeconds as number)]))} fill="none" stroke="var(--fl-border-strong)" strokeWidth="2" />
          {shown.map((r, i) => (
            <circle key={r.id} cx={x(i)} cy={y(r.checkSeconds as number)} r={mine.has(r.id) ? 3.5 : 2} fill={r.isSample ? "var(--fl-amber)" : mine.has(r.id) ? "var(--fl-primary)" : "var(--fl-text-subtle)"}>
              <title>{`${new Date(r.startedAt).toLocaleString()}: ${mmss(r.checkSeconds)}${r.isSample ? " (SAMPLE)" : ""}`}</title>
            </circle>
          ))}
          {highlight && theirs.length > 1 && (
            <>
              <polyline points={line(theirs.map(([r, i]) => [x(i), y(r.checkSeconds as number)]))} fill="none" stroke="var(--fl-primary)" strokeWidth="2.5" />
              <text x={x(theirs[theirs.length - 1][1]) - 4} y={y(theirs[theirs.length - 1][0].checkSeconds as number) + 16} fontSize="11" textAnchor="end" fill="var(--fl-primary-ink)">
                {highlight.label}: {mmss(highlight.medianSeconds)}
              </text>
            </>
          )}
        </svg>
      )}
      {highlight ? (
        <p className="w-fit rounded-full border border-primary-line bg-primary-soft px-3 py-1 text-[14px] font-semibold text-primary-ink" data-testid="trend-callout">
          Consistently faster: {highlight.label} below the station median in {highlight.checks.length} checks in a row (−{highlight.fasterPercent}%)
        </p>
      ) : (
        <p className="text-[14px] text-muted">No Quality Technician is consistently faster than the station median right now.</p>
      )}
    </Card>
  );
}

export function CandidatesCard({ candidates, view }: { candidates: Candidate[]; /** The filters, so the review uses the same checks. */ view: { station: string; range: string; shift: string } }) {
  return (
    <Card className="flex min-w-0 flex-col gap-3 px-6 py-5" testId="candidates">
      <div>
        <h2 className="text-[20px] font-semibold">Ways of working worth a look</h2>
        <p className="text-[14px] text-muted">
          Real, completed checks. A Quality Technician appears here when their last {CANDIDATE_MIN_CHECKS} checks are all faster than the station median by at
          least {CANDIDATE_MIN_IMPROVEMENT_PERCENT}%, with first-time correct not below the station&apos;s.
        </p>
      </div>
      {candidates.length === 0 ? (
        <p className="py-4 text-[15px] text-ink-2" data-testid="candidates-empty">
          Nobody right now. A way of working appears here once someone is faster in {CANDIDATE_MIN_CHECKS} checks in a row.
        </p>
      ) : (
        <Table minWidth={560} testId="candidates-table">
          <thead>
            <tr>
              <Th>Quality Technician</Th>
              <Th>Median CT</Th>
              <Th>Faster than median</Th>
              <Th>First-time correct</Th>
              <Th>Steps faster</Th>
              <Th>
                <span className="sr-only">Review</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c, i) => (
              <tr key={c.who} data-candidate={c.label}>
                <Td>
                  <span className="flex flex-col items-start gap-1">
                    <b>{c.label}</b>
                    <Chip tone="gray" size="sm">
                      Video: not recorded yet
                    </Chip>
                  </span>
                </Td>
                <Td>
                  <b data-testid="candidate-median">{mmss(c.medianSeconds)}</b>
                  <br />
                  <span className="text-[13px] text-primary-ink" data-testid="candidate-faster">
                    −{c.fasterPercent}%
                  </span>
                </Td>
                <Td data-testid="candidate-streak">{c.checks.length} in a row</Td>
                <Td data-testid="candidate-ftc">{c.firstTimeCorrect}%</Td>
                <Td data-testid="candidate-steps">{c.fasterSteps.length ? c.fasterSteps.join(", ") : "none by the step rule"}</Td>
                <Td className="py-1.5 text-right">
                  <ReviewButton candidate={c.who} station={view.station} range={view.range} shift={view.shift} primary={i === 0} />
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <p className="rounded-card border border-primary-line bg-primary-soft px-4 py-2.5 text-[14px] text-primary-ink">
        <b>FactoryLens AI proposes. You decide.</b> One click builds a draft from the checks. Nothing changes until you confirm. Use this to improve the
        process, not to rank people.
      </p>
    </Card>
  );
}
