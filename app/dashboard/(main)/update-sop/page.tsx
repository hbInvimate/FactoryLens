// /dashboard/update-sop: "Last sessions". Finished real checks done correctly first time, newest first.
// The Quality Engineer's only choice is which check to use. Quality Engineer and admin only.
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import { Card, Page, Skeleton } from "@/components/dashboard/light";
import { Filters } from "@/components/dashboard/Filters";
import { Chip, Table, Td, Th } from "@/components/ds";
import { LocalTime } from "@/components/LocalTime";
import { UseThisWay } from "@/components/sop/UseThisWay";
import { dashView } from "@/lib/server/dashView";
import { NotConfigured } from "@/lib/server/repo";
import { activeRevision } from "@/lib/server/sop";
import { completedSessions } from "@/lib/server/sopData";
import { lastSessions } from "@/lib/server/sopUpdate";
import { shiftOf } from "@/lib/shifts";
import { checkTargetSeconds } from "@/lib/sop-revisions";
import { deltaText, mmss } from "@/lib/sop-stats";

export const metadata = { title: "FactoryLens AI: Update SOP" };

async function Body({ searchParams }: { searchParams: PageProps<"/dashboard/update-sop">["searchParams"] }) {
  const sp = await searchParams;
  await connection();
  let view;
  try {
    // "Last sessions" (all time) unless a shorter period is picked; real checks only.
    view = await dashView({ ...sp, range: typeof sp.range === "string" ? sp.range : "all", sample: "0" });
  } catch (e) {
    if (e instanceof NotConfigured) return <Card className="px-5 py-4">The database is not set up. See the README: Set up the database.</Card>;
    throw e;
  }
  const { stations, params, f } = view;
  // Real checks only, whatever the switch elsewhere says.
  const [active, sessions] = await Promise.all([activeRevision(), completedSessions({ ...f, includeSample: false })]);
  const rows = lastSessions(sessions);
  const target = checkTargetSeconds(active);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-[30px] font-bold">Update SOP</h1>
        <p className="text-[16px] text-ink-2">Pick the session whose way of working should become the SOP. The platform does the rest.</p>
      </div>
      <Filters stations={stations} params={params} base="/dashboard/update-sop" fields={["station", "shift", "range"]} allTimeLabel="Last sessions" />
      <Card className="flex flex-col gap-3 px-6 py-5" testId="last-sessions">
        <div>
          <h2 className="text-[20px] font-semibold">Last sessions</h2>
          <p className="text-[14px] text-muted">
            Newest first. Only finished real checks done correctly first time are listed.
            {target !== null ? `  Check time is compared with the target of ${mmss(target)}.` : ""}
          </p>
        </div>
        {rows.length === 0 ? (
          <p className="py-4 text-[15px] text-ink-2" data-testid="last-sessions-empty">
            No finished real checks done correctly the first time at this station{params.shift ? ` in shift ${params.shift}` : ""} yet.
          </p>
        ) : (
          <Table minWidth={820} testId="last-sessions-table">
            <thead>
              <tr>
                <Th>Started</Th>
                <Th>Quality Technician</Th>
                <Th>Shift</Th>
                <Th>Check time</Th>
                <Th>First-time correct</Th>
                <Th>Video</Th>
                <Th>
                  <span className="sr-only">Use</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-session={r.id}>
                  <Td>
                    <Link href={`/dashboard/${r.id}`} className="font-semibold text-primary-ink hover:underline">
                      <LocalTime iso={new Date(r.startedAt).toISOString()} />
                    </Link>
                  </Td>
                  <Td>{r.label}</Td>
                  <Td>{shiftOf(r.startedAt)}</Td>
                  <Td data-testid="check-time">
                    <b>{mmss(Math.round(r.checkSeconds))}</b>
                    {target !== null && <span className="text-muted"> {deltaText(target, Math.round(r.checkSeconds))} vs {mmss(target)}</span>}
                  </Td>
                  <Td>100%</Td>
                  <Td>
                    <Chip tone="gray" size="sm">
                      not recorded yet
                    </Chip>
                  </Td>
                  <Td className="text-right">
                    <UseThisWay sessionId={r.id} label={r.label} startedAt={new Date(r.startedAt).toISOString()} activeLabel={active.label} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </>
  );
}

export default function UpdateSopPage(props: PageProps<"/dashboard/update-sop">) {
  return (
    <Gate area="dashboard" next="/dashboard/update-sop">
      <Page>
        <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-6 py-6 md:px-8">
          <Suspense fallback={<Skeleton />}>
            <Body searchParams={props.searchParams} />
          </Suspense>
        </main>
      </Page>
    </Gate>
  );
}
