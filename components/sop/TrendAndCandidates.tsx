// /dashboard/sop, c1: "Check CT trend" and "Ways of working worth a look" (one-click-flow.md part 1).
import { BigRing } from "@/components/check/CheckMetrics";
import { Card, Chip, Table, Td, Th } from "@/components/ds";
import { ReviewButton } from "./ReviewButton";
import { CANDIDATE_MIN_CHECKS, CANDIDATE_MIN_IMPROVEMENT_PERCENT, PLANT_TIME_ZONE } from "@/lib/config";
import type { Candidate, CheckRow } from "@/lib/sop-candidates";
import { mmss } from "@/lib/sop-stats";

const W = 640;
const H = 210;
const LEFT = 40;
const TOP = 10;
const BOTTOM = 24;
/** At most this many checks in the trend, the newest. */
export const TREND_CHECKS = 60;
/** A check slower than the median by more than this share is an amber dot. */
const SLOW_SHARE = 0.4;

const day = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: PLANT_TIME_ZONE });

export function TrendCard({ rows, medianSeconds, highlight, sample }: {
  /** Completed checks with a check time, oldest first. Includes sample checks when the switch is on. */
  rows: CheckRow[];
  medianSeconds: number | null;
  targetSeconds?: number | null;
  highlight: Candidate | null;
  sample: boolean;
}) {
  const shown = rows.slice(-TREND_CHECKS);
  const values = shown.map((r) => r.checkSeconds as number);
  // The axis in whole minutes, five ticks from 0.
  const top = Math.max(...values, (medianSeconds ?? 0) * (1 + SLOW_SHARE), 60);
  const step = Math.max(60, Math.ceil(top / 4 / 60) * 60);
  const hi = step * 5;
  const ticks = [0, 1, 2, 3, 4, 5].map((i) => i * step);
  const x = (i: number) => (shown.length <= 1 ? (LEFT + W) / 2 : LEFT + 8 + (i * (W - LEFT - 16)) / (shown.length - 1));
  const y = (v: number) => TOP + (H - TOP - BOTTOM) * (1 - v / hi);
  const pts = shown.map((r, i) => [x(i), y(r.checkSeconds as number)] as const);
  const line = pts.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(" ");
  const area = `${pts[0]?.[0] ?? 0},${y(0)} ${line} ${pts[pts.length - 1]?.[0] ?? 0},${y(0)}`;
  const slow = (v: number) => medianSeconds !== null && v > medianSeconds * (1 + SLOW_SHARE);
  const mine = highlight ? new Set(highlight.checks.map((c) => c.id)) : new Set<string>();

  return (
    <Card className="flex min-w-0 flex-col gap-2 px-6 py-5" testId="ct-trend">
      <div className="flex items-start gap-3">
        <div className="flex flex-1 flex-col">
          <h2 className="text-[20px] font-semibold">Check CT trend</h2>
          <p className="text-[14px] text-muted">
            Active time per completed check · amber = slower than median + {SLOW_SHARE * 100}%.{sample ? " Includes SAMPLE checks." : " Real checks only."}
          </p>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[40px] leading-none font-bold tabular-nums">{mmss(medianSeconds)}</span>
          <span className="text-[13px] text-muted">
            median · {shown.length} {shown.length === 1 ? "check" : "checks"}
          </span>
        </div>
      </div>
      {shown.length < 2 ? (
        <p className="py-8 text-center text-[15px] text-muted" data-testid="trend-empty">
          Not enough completed checks in this view to show a trend.
        </p>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Check CT of the last ${shown.length} completed checks. Station median ${mmss(medianSeconds)}.`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={LEFT} x2={W} y1={y(t)} y2={y(t)} stroke="var(--fl-border)" />
              <text x={LEFT - 6} y={y(t) + 3} fontSize="10" textAnchor="end" fill="var(--fl-text-muted)">
                {mmss(t)}
              </text>
            </g>
          ))}
          {medianSeconds !== null && (
            <>
              <rect x={LEFT} width={W - LEFT} y={y(medianSeconds * 1.1)} height={y(medianSeconds * 0.9) - y(medianSeconds * 1.1)} fill="var(--fl-primary-soft)" />
              <line x1={LEFT} x2={W} y1={y(medianSeconds)} y2={y(medianSeconds)} stroke="var(--fl-primary)" strokeDasharray="5 4" strokeWidth="1.5" />
              <text x={W - 4} y={y(medianSeconds) - 6} fontSize="11" fontWeight="700" textAnchor="end" fill="var(--fl-primary-ink)">
                median {mmss(medianSeconds)}
              </text>
            </>
          )}
          <polygon points={area} fill="var(--fl-primary-soft)" opacity="0.7" />
          <polyline points={line} fill="none" stroke="var(--fl-primary)" strokeWidth="2.5" strokeLinejoin="round" />
          {shown.map((r, i) => {
            const v = r.checkSeconds as number;
            return (
              <circle key={r.id} cx={x(i)} cy={y(v)} r={mine.has(r.id) ? 4.5 : 3.5} fill="var(--fl-surface)" stroke={slow(v) ? "var(--fl-amber)" : "var(--fl-primary)"} strokeWidth="2">
                <title>{`${new Date(r.startedAt).toLocaleString("en-US", { timeZone: PLANT_TIME_ZONE })}: ${mmss(v)}${r.isSample ? " (SAMPLE)" : ""}`}</title>
              </circle>
            );
          })}
          <text x={LEFT + 8} y={H - 6} fontSize="10" fill="var(--fl-text-muted)">
            {day(shown[0].startedAt)}
          </text>
          <text x={W - 8} y={H - 6} fontSize="10" textAnchor="end" fill="var(--fl-text-muted)">
            {day(shown[shown.length - 1].startedAt)}
          </text>
        </svg>
      )}
      {highlight && (
        <p className="w-fit rounded-full border border-primary-line bg-primary-soft px-3 py-1 text-[14px] font-semibold text-primary-ink" data-testid="trend-callout">
          Consistently faster: {highlight.label} below the station median in {highlight.checks.length} checks in a row (−{highlight.fasterPercent}%)
        </p>
      )}
    </Card>
  );
}

export function CandidatesCard({ candidates, view, closest }: {
  candidates: Candidate[];
  /** The filters, so the review uses the same checks. */
  view: { station: string; range: string; shift: string };
  /** The Quality Technician nearest to qualifying: their newest checks in a row faster than the median. */
  closest?: { label: string; streak: number } | null;
}) {
  return (
    <Card className="flex min-w-0 flex-col gap-4 px-6 py-5" testId="candidates">
      <div>
        <h2 className="text-[20px] font-semibold">Ways of working worth a look</h2>
        <p className="text-[14px] text-muted">
          A Quality Technician shows up here after {CANDIDATE_MIN_CHECKS} checks in a row faster than the median by at least {CANDIDATE_MIN_IMPROVEMENT_PERCENT}%,
          with first-time correct no lower.
        </p>
      </div>
      {candidates.length === 0 ? (
        closest ? (
          <div className="flex items-center gap-5" data-testid="candidates-empty">
            <BigRing value={Math.min(closest.streak, CANDIDATE_MIN_CHECKS)} of={CANDIDATE_MIN_CHECKS} size={104} stroke={11} label={`${Math.min(closest.streak, CANDIDATE_MIN_CHECKS)}/${CANDIDATE_MIN_CHECKS}`} />
            <span className="flex min-w-0 flex-col">
              <span className="text-[12px] font-bold tracking-wide text-muted uppercase">Closest to qualifying</span>
              <b className="text-[20px]">{closest.label}</b>
              <span className="text-[14px] text-ink-2">
                {closest.streak} of the last {CANDIDATE_MIN_CHECKS} checks faster than median · {Math.max(0, CANDIDATE_MIN_CHECKS - closest.streak)} more to go
              </span>
            </span>
          </div>
        ) : (
          <p className="py-4 text-[15px] text-ink-2" data-testid="candidates-empty">
            Nobody right now. A way of working appears here once someone is faster in {CANDIDATE_MIN_CHECKS} checks in a row.
          </p>
        )
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
      <p className="grid gap-x-6 gap-y-1 rounded-card border border-primary-line bg-primary-soft px-4 py-2.5 text-[14px] text-primary-ink md:grid-cols-[auto_1fr]">
        <b>FactoryLens AI proposes. You decide.</b>
        <span>One click builds a draft from the checks; nothing changes until you confirm. Improve the process, not rank people.</span>
      </p>
    </Card>
  );
}
