// /supervisor/analytics: four charts in a 2×2 grid (first-time right per week, typical time per step, most common
// deviations, discrepancies by station), for the header's weeks and station. Bars and rows open Tasks filtered to them.
import Form from "next/form";
import { connection } from "next/server";
import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import Link from "next/link";
import { ButtonLink, Card, Chip, cx } from "@/components/ds";
import { StepBars } from "@/components/check/CheckMetrics";
import { RFT_GOAL_PERCENT } from "@/lib/config";
import { fmtClock } from "@/lib/format";
import { STEPS } from "@/lib/sop";
import { isMissing, load } from "@/components/supervisor/parts";
import { SupervisorPage } from "@/components/supervisor/SupervisorShell";
import { AutoSubmitSelect } from "@/components/tasks/AutoSubmit";
import { getRepo } from "@/lib/server/repo";
import { DEVIATION_LABEL, PERIOD_WEEKS, analytics, analyticsFilter, type AnalyticsFilter } from "@/lib/server/supervisor";

export const metadata = { title: "FactoryLens AI: Analytics" };

type SP = PageProps<"/supervisor/analytics">["searchParams"];


const query = (f: AnalyticsFilter) => new URLSearchParams({ weeks: String(f.weeks), ...(f.station ? { station: f.station } : {}) }).toString();
const tasks = (p: Record<string, string>) => `/supervisor/tasks?${new URLSearchParams({ status: "all", ...p })}`;

async function Filters({ searchParams }: { searchParams: SP }) {
  const f = analyticsFilter(await searchParams);
  await connection();
  const stations = await load(() => getRepo().stations());
  return (
    <Form action="/supervisor/analytics" className="flex flex-wrap items-center gap-3 [&_select]:w-[200px]" data-testid="analytics-filters">
      <AutoSubmitSelect name="weeks" value={String(f.weeks)} label="Period">
        {PERIOD_WEEKS.map((w) => (
          <option key={w} value={w}>
            Last {w} weeks
          </option>
        ))}
      </AutoSubmitSelect>
      <AutoSubmitSelect name="station" value={f.station ?? "all"} label="Station">
        <option value="all">All stations</option>
        {(isMissing(stations) ? [] : stations).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </AutoSubmitSelect>
      <ButtonLink href={`/api/supervisor/analytics/csv?${query(f)}`} download className="min-h-[56px] text-[16px]" data-testid="export-csv">
        Export CSV
      </ButtonLink>
    </Form>
  );
}

const CARD = "flex min-w-0 flex-col gap-4 rounded-[22px] border border-line bg-surface px-6 py-5 shadow-card";
const DONUT = ["var(--fl-primary)", "var(--fl-amber)", "var(--fl-primary-ink)", "var(--fl-primary-border)", "var(--fl-amber-border)", "var(--fl-border-strong)", "var(--fl-text-muted)", "var(--fl-primary-hover)", "var(--fl-text-subtle)"];
const pctOf = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

/** 270° gauge: amber below the goal, green at or above; the goal is a tick on the track. */
function Gauge({ pct, goal }: { pct: number | null; goal: number }) {
  const r = 80;
  const c = 2 * Math.PI * r;
  const arc = c * 0.75;
  const at = (p: number) => {
    const a = ((135 + 270 * (p / 100)) * Math.PI) / 180;
    return [100 + Math.cos(a) * r, 100 + Math.sin(a) * r];
  };
  const [gx1, gy1] = at(goal).map((v, i) => v + (i === 0 ? Math.cos(((135 + 2.7 * goal) * Math.PI) / 180) : Math.sin(((135 + 2.7 * goal) * Math.PI) / 180)) * 12);
  const [gx2, gy2] = at(goal).map((v, i) => v - (i === 0 ? Math.cos(((135 + 2.7 * goal) * Math.PI) / 180) : Math.sin(((135 + 2.7 * goal) * Math.PI) / 180)) * 12);
  const ok = pct !== null && pct >= goal;
  return (
    <svg viewBox="0 0 200 200" className="w-[220px] flex-none" role="img" aria-label={`Right first time ${pct ?? "—"}%, goal ${goal}%`} data-testid="rft-gauge">
      <circle cx="100" cy="100" r={r} fill="none" stroke="var(--fl-border)" strokeWidth="16" strokeLinecap="round" strokeDasharray={`${arc} ${c}`} transform="rotate(135 100 100)" />
      {pct !== null && (
        <circle cx="100" cy="100" r={r} fill="none" stroke={ok ? "var(--fl-primary)" : "var(--fl-amber)"} strokeWidth="16" strokeLinecap="round" strokeDasharray={`${arc * (pct / 100)} ${c}`} transform="rotate(135 100 100)" className="ring-fill" />
      )}
      <line x1={gx1} y1={gy1} x2={gx2} y2={gy2} stroke="var(--fl-primary-ink)" strokeWidth="4" strokeLinecap="round" />
      <text x="100" y="104" textAnchor="middle" fontSize="40" fontWeight="800" fill={pct === null ? "var(--fl-text-muted)" : ok ? "var(--fl-primary-ink)" : "var(--fl-amber-ink)"}>
        {pct === null ? "—" : `${pct}%`}
      </text>
      <text x="100" y="128" textAnchor="middle" fontSize="13" fill="var(--fl-text-muted)">
        right first time
      </text>
      <text x="152" y="186" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--fl-primary-ink)">
        goal {goal}%
      </text>
    </svg>
  );
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return <p className="text-[13px] text-muted">Not enough checks for a trend yet.</p>;
  const w = 420;
  const h = 48;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / 100) * (h - 6) - 3}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full" preserveAspectRatio="none" aria-hidden data-testid="rft-spark">
      <polyline points={pts} fill="none" stroke="var(--fl-primary)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Row({ label, sub, n, of, tone, testId }: { label: string; sub: string; n: number; of: number; tone: string; testId: string }) {
  return (
    <div className="flex flex-col gap-1.5" data-testid={testId}>
      <div className="flex items-baseline gap-2 text-[15px]">
        <i className={cx("inline-block size-2.5 rounded-sm", tone)} />
        <b>{label}</b>
        <span className="flex-1 text-[13px] text-muted">{sub}</span>
        <b className="tabular-nums">{n}</b>
      </div>
      <span className="h-2 rounded-full bg-surface-2">
        <span className={cx("bar-grow block h-full rounded-full", tone)} style={{ width: `${pctOf(n, of)}%` }} />
      </span>
    </div>
  );
}

async function Body({ searchParams }: { searchParams: SP }) {
  const f = analyticsFilter(await searchParams);
  await connection();
  const a = await load(() => analytics(f));
  if (isMissing(a)) return <Card className="px-6 py-5 text-[17px]">{a.notConfigured}</Card>;
  const goal = RFT_GOAL_PERCENT;
  const rft = a.rft;
  const rate = rft.completed ? pctOf(rft.right, rft.completed) : null;
  const below = rate !== null && rate < goal;
  const devTotal = a.deviationsByStep.reduce((s, d) => s + d.total, 0);
  const maxStep = Math.max(1, ...a.deviationsByStep.map((d) => d.total));
  const top = [...a.deviationsByStep].filter((d) => d.total > 0).sort((x, y) => y.total - x.total || x.step - y.step).slice(0, 3);
  const disc = a.discrepancies;
  const topCat = disc.byCategory[0];
  const last = rft.runningRate.slice(-3);
  const trend = rft.runningRate.length < 2 ? "" : rft.runningRate[rft.runningRate.length - 1] >= rft.runningRate[0] ? "rising" : "falling";
  const banner = rft.completed
    ? `${rft.right} of ${rft.completed} completed checks were right first time.${rft.redone ? ` The misses were at step${rft.redoneSteps.length === 1 ? "" : "s"} ${rft.redoneSteps.join(", ")}.` : ""}${rft.left ? ` ${rft.left} ${rft.left === 1 ? "check was" : "checks were"} left before finishing.` : ""}${topCat ? ` ${topCat.category} is the top discrepancy.` : ""}`
    : "No completed checks in this period yet.";
  // Circumference shares for the donut.
  const C = 2 * Math.PI * 60;
  const lens = disc.byCategory.map((c) => (disc.total ? (c.count / disc.total) * C : 0));
  const starts = lens.map((_, i) => lens.slice(0, i).reduce((x, y) => x + y, 0));
  return (
    <>
      <div className="flex flex-wrap items-center gap-4 rounded-[20px] border border-primary-line bg-primary-soft px-5 py-4" data-testid="ai-banner">
        <span className="flex size-10 flex-none items-center justify-center rounded-[12px] bg-primary text-[15px] font-bold text-on-strong">AI</span>
        <p className="min-w-0 flex-1 text-[16px] text-ink">
          <b className="text-primary-ink">{banner.split(".")[0]}.</b>
          {banner.slice(banner.indexOf(".") + 1)}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={CARD} data-testid="rft-card">
          <div className="flex items-start gap-3">
            <div className="flex flex-1 flex-col">
              <h2 className="text-[20px] font-semibold">Right first time</h2>
              <p className="text-[14px] text-muted">Completed checks with every step right on the first try · last {f.weeks} weeks</p>
            </div>
            {rate !== null && <Chip tone={below ? "amber" : "green"} size="sm">{below ? "Below goal" : "On goal"}</Chip>}
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex flex-col items-center">
              <Gauge pct={rate} goal={goal} />
              {rate !== null && <span className={cx("text-[14px] font-semibold", below ? "text-amber-ink" : "text-primary-ink")}>{below ? `${goal - rate} pts below goal` : "On goal"}</span>}
            </div>
            <div className="flex min-w-[240px] flex-1 flex-col gap-3">
              <Row label="Right first time" sub={`of ${rft.completed} completed`} n={rft.right} of={rft.completed} tone="bg-primary" testId="rft-right" />
              <Row label="Redone" sub={rft.redoneSteps.length ? `steps ${rft.redoneSteps.join(", ")}` : "none"} n={rft.redone} of={rft.completed} tone="bg-amber" testId="rft-redone" />
              <Row label="Left" sub="not scored" n={rft.left} of={Math.max(rft.completed, rft.left)} tone="bg-line-strong" testId="rft-left" />
              <div className="flex items-baseline justify-between border-t border-line pt-2 text-[13px] text-muted">
                <span>Running rate, check by check</span>
                {trend && <b className={trend === "rising" ? "text-primary-ink" : "text-amber-ink"}>{trend === "rising" ? "▲ rising" : "▼ falling"}{last.length === 3 && last.every((v, i) => i === 0 || v >= last[i - 1]) ? " · last 3 holding" : ""}</b>}
              </div>
              <Spark values={rft.runningRate} />
            </div>
          </div>
        </section>

        <section className={CARD} data-testid="step-times">
          <div className="flex items-start gap-3">
            <div className="flex flex-1 flex-col">
              <h2 className="text-[20px] font-semibold">Where the time goes · per step</h2>
              <p className="text-[14px] text-muted">Median time per step vs its target, completed checks</p>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-[40px] leading-none font-bold tabular-nums">{a.medianCycleSeconds === null ? "—" : fmtClock(a.medianCycleSeconds * 1000)}</span>
              <span className="text-[13px] text-muted">median cycle · takt {a.taktSeconds === null ? "—" : fmtClock(a.taktSeconds * 1000)}</span>
            </div>
          </div>
          {!a.steps.some((s) => s.medianSeconds !== null) ? (
            <p className="py-10 text-center text-[17px] text-muted">No data yet</p>
          ) : (
            <>
              <StepBars steps={a.steps.map((s) => ({ n: s.step, seconds: s.medianSeconds, target: s.targetSeconds }))} />
              <div className="grid grid-cols-12 gap-1.5 text-center text-[11px] text-muted">
                {STEPS.map((s) => (
                  <Link key={s.n} href={tasks({ step: String(s.n) })} className="truncate hover:text-primary-ink" title={`${s.n}. ${s.name}`}>
                    {s.short}
                  </Link>
                ))}
              </div>
            </>
          )}
          <span className="flex flex-wrap gap-x-3 text-[13px] text-muted">
            <span><i className="mr-1 inline-block size-2.5 rounded-sm bg-primary" />Median time (on target)</span>
            <span><i className="mr-1 inline-block size-2.5 rounded-sm bg-amber" />Over target</span>
            <span><i className="mr-1 inline-block size-2.5 rounded-sm border border-dashed border-line-strong" />Step target</span>
          </span>
        </section>

        <section className={CARD} data-testid="top-deviations">
          <div className="flex items-start gap-3">
            <div className="flex flex-1 flex-col">
              <h2 className="text-[20px] font-semibold">Deviation hotspots</h2>
              <p className="text-[14px] text-muted">Where in the SOP checks go off-script · last {f.weeks} weeks</p>
            </div>
            <div className="flex flex-col items-end">
              <span className={cx("text-[40px] leading-none font-bold", devTotal ? "text-amber-ink" : "text-primary-ink")} data-testid="deviation-total">
                {devTotal}
              </span>
              <span className="text-[13px] text-muted">deviations</span>
            </div>
          </div>
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12" data-testid="step-tiles">
            {a.deviationsByStep.map((d) => (
              <span
                key={d.step}
                data-step={d.step}
                className={cx("flex flex-col items-center rounded-[10px] py-1.5 text-[12px] font-semibold", d.total === 0 ? "bg-surface-2 text-subtle" : d.total / maxStep > 0.5 ? "bg-amber text-on-amber" : "bg-amber-soft text-amber-ink")}
              >
                Step {d.step}
                <b className="text-[18px]">{d.total || "·"}</b>
              </span>
            ))}
          </div>
          {top.length === 0 ? (
            <p className="py-6 text-center text-[17px] text-muted">No data yet</p>
          ) : (
            <ol className="flex flex-col gap-2" data-testid="deviation-rows">
              {top.map((d, i) => (
                <li key={d.step} className="flex items-center gap-3 rounded-[14px] bg-surface-2 px-4 py-3" data-row={d.step}>
                  <span className="flex size-7 flex-none items-center justify-center rounded-[8px] bg-amber-soft text-[14px] font-bold text-amber-ink">{i + 1}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <b className="truncate text-[15px]">
                      Step {d.step} · {STEPS[d.step - 1].name}
                    </b>
                    <span className="flex flex-wrap gap-1.5">
                      {d.kinds.map((k) => (
                        <Link key={k.kind} href={tasks({ step: String(d.step), dev: k.kind })} className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[12px] hover:border-primary" data-tag={k.kind}>
                          {DEVIATION_LABEL[k.kind]} ×{k.count}
                        </Link>
                      ))}
                    </span>
                  </span>
                  <b className="text-[20px] tabular-nums" data-testid="hotspot-count">{d.total}</b>
                  <span className="w-12 text-right text-[14px] text-muted">{pctOf(d.total, devTotal)}%</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className={CARD} data-testid="station-discrepancies">
          <div className="flex items-start gap-3">
            <div className="flex flex-1 flex-col">
              <h2 className="text-[20px] font-semibold">Discrepancies</h2>
              <p className="text-[14px] text-muted">Issues lodged during checks, by what went wrong</p>
            </div>
            <span className="flex gap-1.5">
              {disc.open > 0 && <Chip tone="red" size="sm">{disc.open} open</Chip>}
              <Chip tone="green" size="sm">{disc.cleared} cleared</Chip>
            </span>
          </div>
          {disc.total === 0 ? (
            <p className="py-10 text-center text-[17px] text-muted">No data yet</p>
          ) : (
            <div className="flex flex-wrap items-center gap-6">
              <svg viewBox="0 0 160 160" className="w-[180px] flex-none" role="img" aria-label={`${disc.total} discrepancies lodged`}>
                <circle cx="80" cy="80" r="60" fill="none" stroke="var(--fl-surface-2)" strokeWidth="26" />
                {disc.byCategory.map((c, i) => (
                  <circle key={c.category} cx="80" cy="80" r="60" fill="none" stroke={DONUT[i % DONUT.length]} strokeWidth="26" strokeDasharray={`${lens[i]} ${C}`} strokeDashoffset={-starts[i]} transform="rotate(-90 80 80)" className="ring-fill" />
                ))}
                <text x="80" y="84" textAnchor="middle" fontSize="34" fontWeight="800" fill="var(--fl-text)">
                  {disc.total}
                </text>
                <text x="80" y="104" textAnchor="middle" fontSize="12" fill="var(--fl-text-muted)">
                  lodged
                </text>
              </svg>
              <div className="flex min-w-[220px] flex-1 flex-col gap-2">
                <ul className="flex flex-col gap-1.5" data-testid="category-legend">
                  {disc.byCategory.map((c, i) => (
                    <li key={c.category} className="flex items-center gap-2 text-[15px]" data-category={c.category}>
                      <i className="inline-block size-3 rounded-sm" style={{ background: DONUT[i % DONUT.length] }} />
                      <span className="flex-1">{c.category}</span>
                      <b className="tabular-nums">{c.count}</b>
                      <span className="w-12 text-right text-muted">{pctOf(c.count, disc.total)}%</span>
                    </li>
                  ))}
                </ul>
                <span className="border-t border-line pt-2 text-[13px] text-muted">By station</span>
                <span className="flex flex-wrap gap-1.5" data-testid="station-rows">
                  {a.byStation.map((s) => (
                    <Link key={s.station} href={tasks({ station: s.station })} className="rounded-full border border-line bg-surface-2 px-3 py-1 text-[13px] font-semibold hover:border-primary" data-row={s.station}>
                      {s.station} · <b>{s.count}</b>
                    </Link>
                  ))}
                </span>
                {disc.openList.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-[12px] bg-red-soft px-3 py-2 text-[14px]" data-open={d.id}>
                    <b className="text-red-ink">Open</b>
                    <span className="min-w-0 flex-1">
                      {d.category} · {d.issue} · {d.station}
                    </span>
                    <Link href={`/supervisor/live/${d.sessionId}`} className="font-semibold text-primary-ink underline">
                      View
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

export default function AnalyticsPage(props: PageProps<"/supervisor/analytics">) {
  return (
    <Gate area="supervisor" next="/supervisor/analytics">
      <SupervisorPage
        current="analytics"
        title="Analytics"
        sub="From real checks only."
        actions={
          <Suspense fallback={null}>
            <Filters searchParams={props.searchParams} />
          </Suspense>
        }
      >
        <Suspense fallback={<p className="text-[17px] text-muted">Loading…</p>}>
          <Body searchParams={props.searchParams} />
        </Suspense>
      </SupervisorPage>
    </Gate>
  );
}
