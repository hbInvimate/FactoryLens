import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { Gate } from "@/components/auth/Gate";
import { isTestMode } from "@/components/TestModeBanner";
import { CardHead, CARD, Donut, HotspotsCard, RftCard, ShiftTimesCard, StepTimesCard } from "@/components/analytics/cards";
import { BigRing } from "@/components/check/CheckMetrics";
import { Filters } from "@/components/dashboard/Filters";
import { Card, Page, Skeleton } from "@/components/dashboard/light";
import { ButtonLink, Chip, cx } from "@/components/ds";
import { OldestHoldAge, SessionsTable } from "@/components/dashboard/SessionsTable";
import { HOLD_WARN_MINUTES, RFT_GOAL_PERCENT, SHIFTS, type ShiftId } from "@/lib/config";
import { includeSampleFor, parseRange, rangeStart, type Range } from "@/lib/dashboard/metrics";
import { dashHref, parseDev, parseShift, type DashParams } from "@/lib/dashboard/params";
import { fmtClock } from "@/lib/format";
import { checkTimeByShift, deviationsByStep, discrepanciesByCategory, summary, type StepDeviations } from "@/lib/server/analytics";
import { getRepo, NotConfigured, SEED_STATION } from "@/lib/server/repo";
import { activeRevision } from "@/lib/server/sop";
import type { DashFilter } from "@/lib/server/sqlparts";
import { analytics } from "@/lib/server/supervisor";
import { revisionLabels } from "@/lib/server/sopActivate";
import { STEPS, step as sopStep } from "@/lib/sop";

export const metadata = { title: "FactoryLens AI: dashboard" };

type SP = PageProps<"/dashboard">["searchParams"];

const TABLE_LIMIT = 200;
/** The right-first-time and step-time cards count in weeks: the date range, rounded up. */
const WEEKS: Record<Range, number> = { "7": 1, "30": 5, "90": 13, all: 520 };
const SHIFT_IDS: ShiftId[] = ["A", "B", "C"];
const KPI = "flex min-w-0 items-center gap-4 rounded-[20px] border border-line bg-surface px-5 py-4 shadow-card";
const clock = (s: number | null) => (s === null ? "—" : fmtClock(s * 1000));

function NotConfiguredCard() {
  return (
    <Card className="px-5 py-4">
      <h2 className="text-[18px] font-semibold">The database is not set up</h2>
      <p className="text-[15px] text-ink-2">DATABASE_URL is not set on the server, so there is nothing to show. See the README: Set up the database.</p>
    </Card>
  );
}

/** A suggested SOP wording for the step's most frequent exact point. */
function suggestion(n: number, item: StepDeviations["items"][number] | undefined): string {
  if (!item) return `Step ${n}: make "${sopStep(n).name}" clearer.`;
  if (item.kind === "order") {
    const [done, before] = item.label.split(" before ");
    return `Step ${n}: check ${before} first, then ${done}.`;
  }
  if (item.kind === "cannot") return `Step ${n}: say what to do when "${item.label.replace(/^Stopped: /, "")}".`;
  return `Step ${n}: confirm ${item.label.split(" ")[0]} before moving on.`;
}

function Shield({ ok }: { ok: boolean }) {
  return (
    <span className={cx("flex size-14 flex-none items-center justify-center rounded-[16px]", ok ? "bg-primary-soft text-primary-ink" : "bg-amber-soft text-amber-ink")} aria-hidden>
      <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
        {ok && <path d="M9 12l2 2 4-4" />}
      </svg>
    </span>
  );
}

function Kpi({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div className={KPI} data-testid={testId}>
      {children}
    </div>
  );
}

async function SessionsSection({ f, params }: { f: DashFilter; params: DashParams }) {
  const [{ rows, total }, labels] = await Promise.all([getRepo().dashboard(f, { devStep: params.dev, limit: TABLE_LIMIT }), revisionLabels()]);
  return (
    <>
      {rows.length === 0 ? (
        <Card className="px-5 py-6 text-center text-[15px] text-muted">No sessions match this filter.</Card>
      ) : (
        <SessionsTable
          query={dashHref(params).split("?")[1]}
          rows={rows.map((r) => ({
            id: r.id,
            startedAt: r.startedAt.toISOString(),
            operator: r.operatorLabel,
            status: r.status,
            conformance: r.conformance,
            deviations: r.deviations,
            discrepancies: r.discrepancies,
            activeSeconds: r.activeSeconds,
            hold: r.hold && { ...r.hold, startedAt: r.hold.startedAt.toISOString() },
            // Older sessions have no revision: they ran on revision A.
            revision: (r.sopRevisionId && labels.get(r.sopRevisionId)) || "A",
          }))}
        />
      )}
      {total > rows.length && (
        <p className="text-[13px] text-muted">
          Showing the newest {rows.length} of {total} sessions. Narrow the date range or shift to see older ones.
        </p>
      )}
    </>
  );
}

async function Body({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  await connection();
  const repo = getRepo();
  let stations: string[];
  try {
    stations = await repo.stations();
  } catch (e) {
    if (e instanceof NotConfigured) return <NotConfiguredCard />;
    throw e;
  }
  const asked = typeof sp.station === "string" ? sp.station : "";
  const station = stations.includes(asked) ? asked : stations.includes(SEED_STATION) ? SEED_STATION : stations[0];
  const params: DashParams = {
    station,
    range: parseRange(sp.range),
    shift: parseShift(sp.shift),
    sample: includeSampleFor(sp.sample, (await repo.counts()).real),
    dev: parseDev(sp.dev),
  };
  const f: DashFilter = { station, since: rangeStart(params.range), shift: params.shift, includeSample: params.sample };
  const conn = await repo.conn();
  const [s, rev, a, devs, shifts, cats] = await Promise.all([
    summary(conn, f),
    activeRevision(),
    analytics({ weeks: WEEKS[params.range], station }),
    deviationsByStep(conn, f, 12),
    checkTimeByShift(conn, f),
    discrepanciesByCategory(conn, f),
  ]);
  const updateHref = `/dashboard/update-sop?station=${encodeURIComponent(station)}`;

  const header = (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      <div className="flex flex-col">
        <h1 className="text-[30px] leading-tight font-bold">Dashboard</h1>
        <p className="text-[15px] text-muted" data-testid="dashboard-sub">
          {station} · SOP rev {rev.label}
        </p>
      </div>
      <Filters stations={stations} params={params} />
      <span className="flex-1" />
      {params.sample && (
        <span data-testid="sample-chip" className="rounded-full border border-amber-line bg-amber-soft px-4 py-1.5 text-[14px] font-bold tracking-wide text-amber-ink">
          SAMPLE DATA · {s.real} real, {s.sample} sample {s.real + s.sample === 1 ? "session" : "sessions"}
        </span>
      )}
      <ButtonLink variant="primary" href={updateHref} data-testid="update-sop-button">
        Update SOP
      </ButtonLink>
    </div>
  );

  if (s.total === 0) {
    return (
      <>
        {header}
        <Card className="px-5 py-8 text-center">
          {isTestMode() ? (
            <>
              <p className="text-[18px] font-semibold" data-testid="dashboard-empty">
                Test mode: nothing at this station in the temporary test database.
              </p>
              <p className="text-[15px] text-muted">
                This server runs with FL_STORAGE=memory. It starts empty, is cleared when the server stops, and does not show the sessions saved in Neon. Run npm run dev without FL_STORAGE to see them.
              </p>
            </>
          ) : (
            <>
              <p className="text-[18px] font-semibold" data-testid="dashboard-empty">No sessions at this station yet.</p>
              <p className="text-[15px] text-muted">Try a longer date range, another shift, or start a check at this station.</p>
            </>
          )}
        </Card>
      </>
    );
  }

  // Deviations per step, all 12; the top step and its most frequent exact point drive the AI banner.
  const devAt = (n: number) => devs.find((d) => d.step === n)?.count ?? 0;
  const byStep = STEPS.map((x) => ({ step: x.n, total: devAt(x.n) }));
  const ranked = [...devs].filter((d) => d.count > 0).sort((x, y) => y.count - x.count || x.step - y.step);
  const lead = ranked[0];
  const leadItem = lead?.items[0];
  const wording = lead ? suggestion(lead.step, leadItem) : null;
  const rftText = a.rft.completed ? `${a.rft.right} of ${a.rft.completed} checks were right first time.` : "No completed checks to score yet.";
  const quiet = s.onHold === 0 && s.openDiscrepancies === 0;
  const catMax = Math.max(1, ...cats.rows.flatMap((r) => SHIFT_IDS.map((x) => r[x])));
  const cleared = Math.max(0, cats.totals.total - s.openDiscrepancies);

  return (
    <>
      {header}

      <div className="flex flex-wrap items-center gap-4 rounded-[20px] border border-primary-line bg-primary-soft px-5 py-4" data-testid="ai-banner">
        <span className="flex size-10 flex-none items-center justify-center rounded-[12px] bg-primary text-[15px] font-bold text-on-strong">AI</span>
        <p className="min-w-0 flex-1 text-[16px] text-ink">
          {lead ? (
            <>
              <b className="text-primary-ink">
                Step {lead.step} · {sopStep(lead.step).name} has the most deviations ({lead.count}){leadItem ? `, most often ${leadItem.label} (×${leadItem.count})` : ""}.
              </b>{" "}
              Suggested SOP wording: “{wording}” {rftText}
            </>
          ) : (
            <>
              <b className="text-primary-ink">No deviations in this period.</b> {rftText}
            </>
          )}
        </p>
        {lead && wording && (
          <ButtonLink variant="primary" href={`${updateHref}&step=${lead.step}&suggest=${encodeURIComponent(wording)}`} data-testid="draft-sop-change">
            Draft SOP change
          </ButtonLink>
        )}
      </div>

      <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-[1.1fr_1.4fr_1fr_1fr]">
        <Kpi>
          <BigRing value={s.complete} of={s.total} size={96} stroke={10} />
          <span className="flex min-w-0 flex-col">
            <span className="text-[14px] text-muted">Sessions</span>
            <b className="text-[30px] leading-tight" data-testid="tile-sessions">
              {s.total}
            </b>
            <span className="text-[13px] text-ink-2" data-testid="tile-sessions-split">
              {`${s.complete} complete · ${s.endedWithoutCheck} ended without a check · ${s.left} left · ${s.inProgress} running`}
            </span>
          </span>
        </Kpi>
        <Kpi>
          <span className="flex min-w-0 flex-col gap-2">
            <span className="text-[14px] text-muted">Station conformance</span>
            <b className="text-[30px] leading-tight" data-testid="tile-conformance">
              {s.conformance === null ? "not recorded" : `${s.conformance}%`}
            </b>
            <span className="flex flex-wrap gap-1" data-testid="conformance-squares">
              {byStep.map((d) => (
                <span
                  key={d.step}
                  data-step={d.step}
                  title={`Step ${d.step}: ${d.total} ${d.total === 1 ? "deviation" : "deviations"}`}
                  className={cx(
                    "flex size-6 items-center justify-center rounded-[6px] text-[11px] font-semibold",
                    d.total === 0 ? "bg-primary text-on-strong" : d.total === 1 ? "bg-amber-soft text-amber-ink" : "bg-amber text-on-amber",
                  )}
                >
                  {d.step}
                </span>
              ))}
            </span>
          </span>
        </Kpi>
        <Kpi>
          <span className="flex min-w-0 flex-col">
            <span className="text-[14px] text-muted">Avg check time</span>
            <b className="text-[40px] leading-tight tabular-nums" data-testid="tile-check-time">
              {s.avgCheckSeconds === null ? "not recorded" : clock(s.avgCheckSeconds)}
            </b>
            <span className="text-[13px] text-ink-2">
              median {clock(s.medianCheckSeconds)} · takt {clock(a.taktSeconds)}
            </span>
          </span>
        </Kpi>
        <Kpi>
          <Shield ok={quiet} />
          <span className="flex min-w-0 flex-col">
            <span className="text-[14px] text-muted">Open holds · discrepancies</span>
            <b className={cx("text-[30px] leading-tight tabular-nums", quiet ? "text-primary-ink" : "text-amber-ink")}>
              <span data-testid="tile-open-holds">{s.onHold}</span> · <span data-testid="tile-open">{s.openDiscrepancies}</span>
            </b>
            {quiet ? (
              <span className="text-[13px] text-primary-ink">nothing waiting on you</span>
            ) : (
              <>
                {s.oldestHold && (
                  <span className="text-[13px]">
                    <OldestHoldAge since={s.oldestHold.toISOString()} />
                  </span>
                )}
                <Link href="#sessions" className="text-[13px] font-semibold text-amber-ink underline">
                  {s.onHold} on hold, {s.openDiscrepancies} open: see sessions
                </Link>
              </>
            )}
          </span>
        </Kpi>
      </div>

      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <RftCard rft={a.rft} goal={RFT_GOAL_PERCENT} sub={`Completed checks with every step right on the first try · last ${WEEKS[params.range] >= 520 ? "all" : WEEKS[params.range]} weeks`} />
        <StepTimesCard
          steps={a.steps.map((x) => ({ step: x.step, name: sopStep(x.step).name, medianSeconds: x.medianSeconds, targetSeconds: x.targetSeconds }))}
          medianCycleSeconds={a.medianCycleSeconds}
          taktSeconds={a.taktSeconds}
        />
        <HotspotsCard
          testId="block-deviations"
          sub="Where checks go off-script, with the exact point. Click a step to filter the sessions."
          byStep={byStep}
          top={ranked.slice(0, 3).map((d) => ({
            step: d.step,
            name: sopStep(d.step).name,
            total: d.count,
            href: `${dashHref(params, { dev: d.step })}#sessions`,
            tags: [
              ...d.items.map((i) => ({ key: i.label, label: `${i.label} ×${i.count}` })),
              ...(d.notRecorded ? [{ key: "not-recorded", label: `points not recorded ×${d.notRecorded}` }] : []),
            ],
          }))}
        />
        <ShiftTimesCard shifts={shifts} taktSeconds={a.taktSeconds} active={params.shift} />
      </div>

      <section className={CARD} data-testid="block-categories">
        <CardHead
          title="Discrepancies"
          sub="Issues lodged on the monitor, by category and the shift they were lodged in"
          right={
            <span className="flex gap-1.5">
              {s.openDiscrepancies > 0 && (
                <Chip tone="red" size="sm">
                  {s.openDiscrepancies} open
                </Chip>
              )}
              <Chip tone="green" size="sm">
                {cleared} cleared
              </Chip>
            </span>
          }
        />
        {cats.totals.total === 0 && cats.fixedOnSpot.total === 0 ? (
          <p className="py-6 text-center text-[17px] text-muted">No discrepancies lodged in this period.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-8">
            <Donut parts={cats.rows.map((r) => ({ label: r.category, count: r.total }))} total={cats.totals.total} />
            <div className="flex w-full max-w-[760px] min-w-0 flex-1 flex-col gap-2">
              <table className="w-full text-[15px]" data-testid="category-table">
                <thead className="text-[13px] text-muted">
                  <tr>
                    <th className="py-1 text-left font-medium">Category</th>
                    {SHIFT_IDS.map((x) => (
                      <th key={x} className={cx("w-24 py-1 text-center font-medium", params.shift && params.shift !== x && "opacity-40")}>
                        Shift {x}
                      </th>
                    ))}
                    <th className="w-20 py-1 text-center font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {cats.rows.map((r) => (
                    <tr key={r.category} data-category={r.category}>
                      <td className="py-1 pr-2">{r.category}</td>
                      {SHIFT_IDS.map((x) => (
                        <td key={x} className={cx("px-1 py-1 text-center", params.shift && params.shift !== x && "opacity-40")}>
                          <span
                            className={cx(
                              "inline-flex min-w-12 justify-center rounded-[8px] px-2 py-1 font-semibold",
                              r[x] === 0 ? "bg-surface-2 text-subtle" : r[x] / catMax > 0.5 ? "bg-primary text-on-strong" : "bg-primary-soft text-primary-ink",
                            )}
                            data-shift={x}
                          >
                            {r[x]}
                          </span>
                        </td>
                      ))}
                      <td className="py-1 text-center font-bold" data-shift="total">
                        {r.total}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t border-line font-semibold">
                    <td className="py-1.5">All categories</td>
                    {SHIFT_IDS.map((x) => (
                      <td key={x} className={cx("py-1.5 text-center", params.shift && params.shift !== x && "opacity-40")}>
                        {cats.totals[x]}
                      </td>
                    ))}
                    <td className="py-1.5 text-center">{cats.totals.total}</td>
                  </tr>
                </tbody>
              </table>
              <p className="text-[13px] text-ink-2" data-testid="fixed-on-spot">
                Fixed on the spot (not lodged): {SHIFTS.map((x) => `Shift ${x.id} ${cats.fixedOnSpot[x.id]}`).join(" · ")} · total {cats.fixedOnSpot.total}
              </p>
            </div>
          </div>
        )}
      </section>

      <div id="sessions" className="flex flex-wrap items-center gap-3 pt-2">
        <h2 className="text-[20px] font-semibold">Sessions</h2>
        {params.dev && (
          <Link
            href={dashHref(params, { dev: null })}
            scroll={false}
            data-testid="dev-filter-chip"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-primary-line bg-primary-soft px-4 text-[14px] font-semibold text-primary-ink hover:bg-surface"
            aria-label={`Remove filter: Step ${params.dev} deviations`}
          >
            Filter: Step {params.dev} deviations <span aria-hidden>✕</span>
          </Link>
        )}
      </div>
      <Suspense fallback={<Skeleton rows={4} />}>
        <SessionsSection f={f} params={params} />
      </Suspense>
      <p className="text-[13px] text-muted">
        Conformance = steps correct on the first attempt ÷ 12, averaged over complete sessions. Sessions on hold, ended without a check, or left are not scored and are left out of averages. Waiting turns red after {HOLD_WARN_MINUTES} minutes.
      </p>
    </>
  );
}

export default function DashboardPage(props: PageProps<"/dashboard">) {
  return (
    <Gate area="dashboard" next="/dashboard">
      <Page>
        <main className="page-main flex min-h-dvh flex-col gap-4">
          <Suspense fallback={<Skeleton />}>
            <Body searchParams={props.searchParams} />
          </Suspense>
        </main>
      </Page>
    </Gate>
  );
}
