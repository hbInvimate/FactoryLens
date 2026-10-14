import { connection } from "next/server";
import { Suspense } from "react";
import { Filters } from "@/components/dashboard/Filters";
import { Card, Note, Page, Skeleton, StatCard } from "@/components/dashboard/light";
import { OldestHoldAge, SessionsTable } from "@/components/dashboard/SessionsTable";
import { PageBar } from "@/components/PageBar";
import { includeSampleFor, parseRange, rangeStart, summarise } from "@/lib/dashboard/metrics";
import { HOLD_WARN_MINUTES } from "@/lib/config";
import { fmtClock } from "@/lib/format";
import { getRepo, NotConfigured, SEED_STATION } from "@/lib/server/repo";

export const metadata = { title: "FactoryLens AI: dashboard" };

type SP = PageProps<"/dashboard">["searchParams"];

function NotConfiguredCard() {
  return (
    <Card className="px-5 py-4">
      <h2 className="text-[18px] font-semibold">The database is not set up</h2>
      <p className="text-[15px] text-[#4b5563]">DATABASE_URL is not set on the server, so there is nothing to show. See the README: Set up the database.</p>
    </Card>
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
  const range = parseRange(sp.range);
  const includeSample = includeSampleFor(sp.sample, (await repo.counts()).real);
  const rows = await repo.dashboard(station, rangeStart(range), includeSample);
  const s = summarise(rows.map((r) => ({ ...r, holdStartedAt: r.hold?.startedAt ?? null })));

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <h1 className="text-[30px] font-semibold">Dashboard</h1>
        <Filters stations={stations} station={station} range={range} includeSample={includeSample} />
        <span className="flex-1" />
        {includeSample && (
          <span data-testid="sample-chip" className="rounded-full bg-[#fdeec8] px-4 py-1.5 text-[14px] font-bold tracking-wide text-[#6b4e00]">
            SAMPLE DATA
          </span>
        )}
      </div>
      <Note />

      {rows.length === 0 ? (
        <Card className="px-5 py-8 text-center">
          <p className="text-[18px] font-semibold" data-testid="dashboard-empty">No sessions at this station yet.</p>
          <p className="text-[15px] text-[#6b7480]">Try a longer date range, or start a check at this station.</p>
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
              value={s.noDeviationShare === null ? "not recorded" : `${s.noDeviationShare}%`}
              label="Sessions with no deviation"
              sub={s.scored ? `${s.noDeviation} of ${s.scored} complete` : "no complete sessions yet"}
            />
            <StatCard
              testId="tile-check-time"
              value={s.avgCheckSeconds === null ? "not recorded" : fmtClock(s.avgCheckSeconds * 1000)}
              label="Average check time"
              sub={s.timed ? `complete sessions, without pauses and holds (${s.timed})` : "no complete sessions yet"}
            />
            <StatCard testId="tile-open" value={s.openDiscrepancies} label="Open discrepancies" sub="lodged, not yet cleared" />
          </div>

          <h2 className="pt-2 text-[20px] font-semibold">Sessions</h2>
          <SessionsTable
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
