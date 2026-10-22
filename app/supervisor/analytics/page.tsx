// /supervisor/analytics: four charts in a 2×2 grid (first-time right per week, average time per step, most common
// deviations, discrepancies by station), for the header's weeks and station. Bars and rows open Tasks filtered to them.
import Form from "next/form";
import { connection } from "next/server";
import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import { ButtonLink, Card } from "@/components/ds";
import { ChartCard, CountBars, FtrLine, StepBars } from "@/components/supervisor/charts";
import { isMissing, load } from "@/components/supervisor/parts";
import { SupervisorPage } from "@/components/supervisor/SupervisorShell";
import { AutoSubmitSelect } from "@/components/tasks/AutoSubmit";
import { getRepo } from "@/lib/server/repo";
import { DEVIATION_LABEL, PERIOD_WEEKS, analytics, analyticsFilter, type AnalyticsFilter } from "@/lib/server/supervisor";

export const metadata = { title: "FactoryLens AI: Analytics" };

type SP = PageProps<"/supervisor/analytics">["searchParams"];

const dayMonth = (ymd: string) => {
  const [, m, d] = ymd.split("-").map(Number);
  return `${d}/${m}`;
};

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
  const where = f.station ? ` at ${f.station}` : "";
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="First-time right per week" sub={`All 12 steps correct on the first attempt${where}, per week.`} testId="ftr-weeks" empty={!a.weeks.some((w) => w.completed > 0)}>
        <FtrLine weeks={a.weeks.map((w) => ({ ...w, label: dayMonth(w.start) }))} />
      </ChartCard>
      <ChartCard title="Average time per step" sub={`Completed checks${where}. Dark mark: target; amber: over it.`} testId="step-times" empty={!a.steps.some((s) => s.avgSeconds !== null)}>
        <StepBars steps={a.steps.map((s) => ({ ...s, href: tasks({ step: String(s.step) }) }))} />
      </ChartCard>
      <ChartCard title="Most common deviations" sub={`Skipped or wrong order, top 5${where}.`} testId="top-deviations" empty={a.deviations.length === 0}>
        <CountBars
          testId="deviation-rows"
          tone="amber"
          rows={a.deviations.map((d) => ({ key: `${d.step}-${d.kind}`, label: `Step ${d.step} ${DEVIATION_LABEL[d.kind]}`, count: d.count, href: tasks({ step: String(d.step), dev: d.kind }) }))}
        />
      </ChartCard>
      <ChartCard title="Discrepancies by station" sub="Lodged during checks." testId="station-discrepancies" empty={a.byStation.length === 0}>
        <CountBars testId="station-rows" tone="red" rows={a.byStation.map((s) => ({ key: s.station, label: s.station, count: s.count, href: tasks({ station: s.station }) }))} />
      </ChartCard>
    </div>
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
