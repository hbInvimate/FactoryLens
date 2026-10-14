import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Block, CategoriesBlock, CheckTimeBlock, ConformanceBlock, DeviationsBlock } from "@/components/dashboard/blocks";
import { Filters } from "@/components/dashboard/Filters";
import { Card, Note, Page, Skeleton, StatCard } from "@/components/dashboard/light";
import { OldestHoldAge, SessionsTable } from "@/components/dashboard/SessionsTable";
import { PageBar } from "@/components/PageBar";
import { HOLD_WARN_MINUTES } from "@/lib/config";
import { includeSampleFor, parseRange, rangeStart } from "@/lib/dashboard/metrics";
import { dashHref, parseDev, parseShift, type DashParams } from "@/lib/dashboard/params";
import { fmtClock } from "@/lib/format";
import { summary } from "@/lib/server/analytics";
import { getRepo, NotConfigured, SEED_STATION } from "@/lib/server/repo";
import type { DashFilter } from "@/lib/server/sqlparts";
import { plantDay } from "@/lib/shifts";

export const metadata = { title: "FactoryLens AI: dashboard" };

type SP = PageProps<"/dashboard">["searchParams"];

const TABLE_LIMIT = 200;

function NotConfiguredCard() {
  return (
    <Card className="px-5 py-4">
      <h2 className="text-[18px] font-semibold">The database is not set up</h2>
      <p className="text-[15px] text-[#4b5563]">DATABASE_URL is not set on the server, so there is nothing to show. See the README: Set up the database.</p>
    </Card>
  );
}

/** Today on the plant's clock (the right end of block 1). */
function plantToday(): string {
  return plantDay(Date.now());
}

async function SessionsSection({ f, params }: { f: DashFilter; params: DashParams }) {
  const { rows, total } = await getRepo().dashboard(f, { devStep: params.dev, limit: TABLE_LIMIT });
  return (
    <>
      {rows.length === 0 ? (
        <Card className="px-5 py-6 text-center text-[15px] text-[#6b7480]">No sessions match this filter.</Card>
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
          }))}
        />
      )}
      {total > rows.length && (
        <p className="text-[13px] text-[#6b7480]">
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
  const s = await summary(await repo.conn(), f);

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <h1 className="text-[30px] font-semibold">Dashboard</h1>
        <Filters stations={stations} params={params} />
        <span className="flex-1" />
        {params.sample && (
          <span data-testid="sample-chip" className="rounded-full bg-[#fdeec8] px-4 py-1.5 text-[14px] font-bold tracking-wide text-[#6b4e00]">
            SAMPLE DATA · {s.real} real, {s.sample} sample {s.real + s.sample === 1 ? "session" : "sessions"}
          </span>
        )}
      </div>
      <Note />

      {s.total === 0 ? (
        <Card className="px-5 py-8 text-center">
          <p className="text-[18px] font-semibold" data-testid="dashboard-empty">No sessions at this station yet.</p>
          <p className="text-[15px] text-[#6b7480]">Try a longer date range, another shift, or start a check at this station.</p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatCard
              testId="tile-sessions"
              value={s.total}
              label="Sessions"
              sub={
                <span data-testid="tile-sessions-split">
                  {`${s.complete} complete · ${s.onHold} on hold · ${s.endedWithoutCheck} ended without a check · ${s.left} left${s.inProgress ? ` · ${s.inProgress} in progress` : ""}`}
                </span>
              }
            />
            <StatCard
              testId="tile-open-holds"
              value={s.onHold}
              label="Open holds"
              sub={s.oldestHold ? <OldestHoldAge since={s.oldestHold.toISOString()} /> : "none waiting"}
            />
            <StatCard
              testId="tile-conformance"
              value={s.conformance === null ? "not recorded" : `${s.conformance}%`}
              label="Station conformance"
              sub={s.scored ? `steps correct first time, ${s.scored} complete ${s.scored === 1 ? "session" : "sessions"}` : "no complete sessions yet"}
            />
            <StatCard
              testId="tile-no-deviation"
              value={s.scored ? `${Math.round((s.noDeviation / s.scored) * 100)}%` : "not recorded"}
              label="Sessions with no deviation"
              sub={s.scored ? `${s.noDeviation} of ${s.scored} complete` : "no complete sessions yet"}
            />
            <StatCard
              testId="tile-check-time"
              value={s.avgCheckSeconds === null ? "not recorded" : fmtClock(s.avgCheckSeconds * 1000)}
              label="Average check time"
              sub={
                s.timed
                  ? `complete sessions, without pauses and holds (${s.timed})${s.untimed ? `; ${s.untimed} without a recorded time` : ""}`
                  : "no complete sessions yet"
              }
            />
            <StatCard testId="tile-open" value={s.openDiscrepancies} label="Open discrepancies" sub="lodged, not yet cleared" />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
            <Block n={1} title="Conformance, all previous sessions" sub="Each bar is one day (plant time). Hover a bar for the date, conformance and count." testId="block-conformance">
              <ConformanceBlock f={f} today={plantToday()} />
            </Block>
            <Block n={2} title="Average check time by shift" sub="Active time from start to finish, without pauses or holds. Completed sessions only." testId="block-shifts">
              <CheckTimeBlock f={f} />
            </Block>
            <Block n={3} title="Steps that cause most deviations" sub="Top steps, with the exact point under each: which hole, clamp or edge point." testId="block-deviations">
              <DeviationsBlock f={f} active={params.dev} devHref={(step) => `${dashHref(params, { dev: step })}#sessions`} />
            </Block>
            <Block n={4} title="Lodged discrepancies by category and shift" sub="Count of issues lodged on the monitor. Darker means more." testId="block-categories">
              <CategoriesBlock f={f} />
            </Block>
          </div>

          <div id="sessions" className="flex flex-wrap items-center gap-3 pt-2">
            <h2 className="text-[20px] font-semibold">Sessions</h2>
            {params.dev && (
              <Link
                href={dashHref(params, { dev: null })}
                scroll={false}
                data-testid="dev-filter-chip"
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#e3edfc] px-4 text-[14px] font-semibold text-[#1f5fcf] hover:brightness-95"
                aria-label={`Remove filter: Step ${params.dev} deviations`}
              >
                Filter: Step {params.dev} deviations <span aria-hidden>✕</span>
              </Link>
            )}
          </div>
          <Suspense fallback={<Skeleton rows={4} />}>
            <SessionsSection f={f} params={params} />
          </Suspense>
          <p className="text-[13px] text-[#6b7480]">
            Conformance = steps correct on the first attempt ÷ 12, averaged over complete sessions. Sessions on hold, ended without a check, or left are not scored and are left out of averages. Waiting turns red after {HOLD_WARN_MINUTES} minutes.
          </p>
        </>
      )}
    </>
  );
}

export default function DashboardPage(props: PageProps<"/dashboard">) {
  return (
    <>
      <PageBar current="dashboard" />
      <Page>
        <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-6 py-6 md:px-8">
          <Suspense fallback={<Skeleton />}>
            <Body searchParams={props.searchParams} />
          </Suspense>
        </main>
      </Page>
    </>
  );
}
