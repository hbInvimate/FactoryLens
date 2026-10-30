// /supervisor/analytics: four charts in a 2×2 grid (first-time right per week, typical time per step, most common
// deviations, discrepancies by station), for the header's weeks and station. Bars and rows open Tasks filtered to them.
import Form from "next/form";
import { connection } from "next/server";
import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import Link from "next/link";
import { ButtonLink, Card, Chip } from "@/components/ds";
import { CARD, DONUT, Donut, HotspotsCard, RftCard, StepTimesCard, pctOf } from "@/components/analytics/cards";
import { RFT_GOAL_PERCENT } from "@/lib/config";
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

async function Body({ searchParams }: { searchParams: SP }) {
  const f = analyticsFilter(await searchParams);
  await connection();
  const a = await load(() => analytics(f));
  if (isMissing(a)) return <Card className="px-6 py-5 text-[17px]">{a.notConfigured}</Card>;
  const rft = a.rft;
  const top = [...a.deviationsByStep].filter((d) => d.total > 0).sort((x, y) => y.total - x.total || x.step - y.step).slice(0, 3);
  const disc = a.discrepancies;
  const topCat = disc.byCategory[0];
  const banner = rft.completed
    ? `${rft.right} of ${rft.completed} completed checks were right first time.${rft.redone ? ` The misses were at step${rft.redoneSteps.length === 1 ? "" : "s"} ${rft.redoneSteps.join(", ")}.` : ""}${rft.left ? ` ${rft.left} ${rft.left === 1 ? "check was" : "checks were"} left before finishing.` : ""}${topCat ? ` ${topCat.category} is the top discrepancy.` : ""}`
    : "No completed checks in this period yet.";
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
        <RftCard rft={rft} goal={RFT_GOAL_PERCENT} sub={`Completed checks with every step right on the first try · last ${f.weeks} weeks`} />
        <StepTimesCard
          steps={a.steps.map((s) => ({ step: s.step, name: STEPS[s.step - 1].name, medianSeconds: s.medianSeconds, targetSeconds: s.targetSeconds }))}
          medianCycleSeconds={a.medianCycleSeconds}
          taktSeconds={a.taktSeconds}
          stepHref={(n) => tasks({ step: String(n) })}
        />
        <HotspotsCard
          sub={`Where in the SOP checks go off-script · last ${f.weeks} weeks`}
          byStep={a.deviationsByStep}
          top={top.map((d) => ({
            step: d.step,
            name: STEPS[d.step - 1].name,
            total: d.total,
            tags: d.kinds.map((k) => ({ key: k.kind, label: `${DEVIATION_LABEL[k.kind]} ×${k.count}`, href: tasks({ step: String(d.step), dev: k.kind }) })),
          }))}
        />

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
              <Donut parts={disc.byCategory.map((c) => ({ label: c.category, count: c.count }))} total={disc.total} />
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
