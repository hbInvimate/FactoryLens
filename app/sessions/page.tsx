import { durationText } from "@/lib/format";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LocalTime } from "@/components/LocalTime";
import { Gate } from "@/components/auth/Gate";
import { TechShell } from "@/components/tasks/TechShell";
import { StatusChip } from "@/components/StatusChip";
import { isTestMode } from "@/components/TestModeBanner";
import { seesAllSessions } from "@/lib/auth/roles";
import { currentUser } from "@/lib/auth/server";
import { Chip } from "@/components/ui";
import { conformanceLabel, includeSampleFor } from "@/lib/dashboard/metrics";
import { getRepo, NotConfigured } from "@/lib/server/repo";
import { SampleSwitch } from "./SampleSwitch";
import { NotConfiguredNotice, TableSkeleton } from "./shared";

export const metadata = { title: "FactoryLens AI: past sessions" };

async function SessionTable({ searchParams }: { searchParams: PageProps<"/sessions">["searchParams"] }) {
  const sp = await searchParams;
  await connection();
  let rows;
  let includeSample: boolean;
  // A Quality Technician sees only their own checks (never sample data, which has no owner); an admin sees all.
  const user = await currentUser();
  const all = !!user && seesAllSessions(user.role);
  try {
    const repo = getRepo();
    includeSample = all ? includeSampleFor(sp.sample, (await repo.counts()).real) : false;
    rows = await repo.list(200, all ? { includeSample } : { userId: user?.id ?? "-" });
  } catch (e) {
    if (e instanceof NotConfigured) return <NotConfiguredNotice />;
    throw e;
  }
  const switchRow = all ? (
    <div className="flex flex-wrap items-center gap-3">
      <SampleSwitch on={includeSample} />
    </div>
  ) : (
    <p className="text-[17px] text-ink-2" data-testid="history-scope">
      Your checks, signed in as {user?.name}.
    </p>
  );
  if (!rows.length) {
    return (
      <>
        {switchRow}
        <p className="text-[19px] text-ink-2" data-testid="history-empty">
          {isTestMode() ? "Test mode: no checks in the temporary test database yet. Sessions saved in Neon are not shown here. " : "No checks yet. "}
          <Link href="/" className="font-semibold text-primary-ink underline">Start one</Link>.
        </p>
      </>
    );
  }
  return (
    <>
    {switchRow}
    <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-card">
      <table className="w-full min-w-[1100px] text-left text-[17px]">
        <thead className="bg-surface-2 text-[15px] text-muted">
          <tr className="border-b border-line">
            <th className="px-5 py-3 font-medium">Started</th>
            <th className="px-3 py-3 font-medium">Part</th>
            <th className="px-3 py-3 font-medium">Cell and fixture</th>
            <th className="px-3 py-3 font-medium">Quality Technician</th>
            <th className="px-3 py-3 font-medium">Status</th>
            <th className="px-3 py-3 font-medium">Duration</th>
            <th className="px-3 py-3 font-medium">Steps</th>
            <th className="px-3 py-3 font-medium">Check points</th>
            <th className="px-3 py-3 font-medium">Deviations</th>
            <th className="px-3 py-3 font-medium">Discrepancies</th>
            <th className="px-5 py-3 font-medium">Conformance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} data-session={r.id} className="border-b border-line last:border-0 hover:bg-surface-2">
              <td className="px-5 py-1">
                <span className="flex flex-wrap items-center gap-2">
                  <Link href={`/sessions/${r.id}`} className="tap inline-flex items-center font-semibold text-primary-ink underline-offset-4 hover:underline">
                    <LocalTime iso={r.startedAt.toISOString()} />
                  </Link>
                  {r.isSample && (
                    <span data-testid="sample-row-chip">
                      <Chip tone="amber" small>
                        SAMPLE
                      </Chip>
                    </span>
                  )}
                </span>
              </td>
              <td className="px-3">{r.part}</td>
              <td className="px-3">{r.fixture}</td>
              <td className="px-3">{r.operatorLabel}</td>
              <td className="px-3"><StatusChip status={r.status} /></td>
              <td className="px-3 whitespace-nowrap tabular-nums" data-testid="duration">{durationText(r.status, r.durationSeconds)}</td>
              <td className="px-3">{r.stepsDone} / 12</td>
              <td className="px-3">{r.checkPoints} / 50</td>
              <td className="px-3">{r.deviations}</td>
              <td className="px-3">{r.discrepancies}</td>
              <td className="px-5">{conformanceLabel(r.status, r.conformance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

export default function SessionsPage(props: PageProps<"/sessions">) {
  return (
    <Gate area="check" next="/sessions">
      <TechShell current="sessions">
        <main className="flex flex-1 flex-col gap-5 px-8 py-7">
          <h1 className="text-[30px] font-semibold">Past sessions</h1>
          <Suspense fallback={<TableSkeleton />}>
            <SessionTable searchParams={props.searchParams} />
          </Suspense>
        </main>
      </TechShell>
    </Gate>
  );
}
