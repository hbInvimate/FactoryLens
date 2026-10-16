// /dashboard/sop (docs/sop-management/screens/s1): the Active revision, how each step is performed, and the
// revisions. Quality Engineer and admin only. FactoryLens AI shows the data; the Quality Engineer decides.
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import { Card, Page, Skeleton } from "@/components/dashboard/light";
import { Filters } from "@/components/dashboard/Filters";
import { buttonClass, Table, Td, Th } from "@/components/ds";
import { Cautions, RevisionChip, SampleChip, StatusChip } from "@/components/sop/parts";
import { LocalTime } from "@/components/LocalTime";
import { activeCheckMs, reduce } from "@/lib/check/reducer";
import { dashView, viewQuery } from "@/lib/server/dashView";
import { NotConfigured } from "@/lib/server/repo";
import { activeRevision } from "@/lib/server/sop";
import { completedSessions, medianCheckSeconds, revisions } from "@/lib/server/sopData";
import { STEPS } from "@/lib/sop";
import { checkTargetSeconds } from "@/lib/sop-revisions";
import { mmss, stepStats } from "@/lib/sop-stats";

export const metadata = { title: "FactoryLens AI: SOP management" };

async function Body({ searchParams }: { searchParams: PageProps<"/dashboard/sop">["searchParams"] }) {
  const sp = await searchParams;
  await connection();
  let view;
  try {
    view = await dashView(sp);
  } catch (e) {
    if (e instanceof NotConfigured) {
      return (
        <Card className="px-5 py-4">
          <h2 className="text-[18px] font-semibold">The database is not set up</h2>
          <p className="text-[15px] text-ink-2">See the README: Set up the database.</p>
        </Card>
      );
    }
    throw e;
  }
  const { stations, params, f } = view;
  const [active, revs, sessions] = await Promise.all([activeRevision(), revisions(), completedSessions(f)]);
  const stats = stepStats(sessions);
  const target = checkTargetSeconds(active);
  const medianCheck = medianCheckSeconds(sessions.map((s) => {
    const ms = activeCheckMs(reduce(s.actions, s.startedAt));
    return ms === null ? null : ms / 1000;
  }));
  const activeSummary = revs.find((r) => r.id === active.id);
  const sample = sessions.filter((s) => s.isSample).length;
  const q = viewQuery(params);

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <h1 className="text-[30px] font-bold">SOP management</h1>
        <Filters stations={stations} params={params} base="/dashboard/sop" />
        <span className="flex-1" />
        {params.sample && <SampleChip real={sessions.length - sample} sample={sample} />}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="flex flex-col gap-2 px-6 py-5" testId="active-revision">
          <h2 className="text-[20px] font-semibold">First-off check, B-pillar outer</h2>
          <p className="text-[14px] text-muted">Active revision</p>
          <p className="flex flex-wrap items-center gap-3 text-[15px] text-ink-2">
            <RevisionChip label={active.label} status="active" />
            {activeSummary?.activatedAt ? (
              <span>
                since <LocalTime iso={activeSummary.activatedAt} /> · 12 steps
              </span>
            ) : (
              <span>12 steps{active.id === null ? " · from lib/sop.ts (no revisions in the database)" : ""}</span>
            )}
          </p>
          <p className="text-[16px]" data-testid="check-ct-target">
            Check CT target <b>{target === null ? "not set" : mmss(target)}</b>
            {target === null ? " (set when all 12 steps have a target)" : " (sum of the 12 step targets)"} · Median actual{" "}
            <b>{mmss(medianCheck)}</b>
          </p>
        </Card>

        <Card className="flex flex-col gap-2 px-6 py-5" testId="revisions">
          <h2 className="text-[20px] font-semibold">Revisions</h2>
          <p className="text-[14px] text-muted">Every change is recorded and can be rolled back.</p>
          <ul className="flex flex-col">
            {revs.length === 0 && <li className="py-2 text-[15px] text-muted">No revisions in the database yet. The SOP in lib/sop.ts is used.</li>}
            {revs.map((r) => (
              <li key={r.id} data-revision={r.label} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-t border-line py-2.5 text-[15px] first:border-t-0">
                <span className="flex items-center gap-2">
                  <b>Rev {r.label}</b>
                  <StatusChip status={r.status} />
                </span>
                <span>
                  {r.changes.length
                    ? r.changes.map((c) => `Step ${c.step}: new CT ${mmss(c.newCtSeconds)}`).join(" · ")
                    : r.label === "A"
                      ? "Baseline"
                      : r.changeReason ?? "No changes yet"}
                </span>
                <span className="text-muted">
                  {r.status === "draft" ? r.createdBy ?? "" : <LocalTime iso={r.activatedAt ?? r.createdAt} />}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="flex flex-col gap-3 px-6 py-5">
        <div>
          <h2 className="text-[20px] font-semibold">Target CT and how each step is performed</h2>
          <p className="text-[14px] text-muted">
            Completed sessions, {params.sample ? "including SAMPLE data" : "real data only"}. Times are active time per step, without pauses and holds.
            FactoryLens AI shows data. The Quality Engineer decides.
          </p>
        </div>
        {sessions.length === 0 && (
          <p className="text-[15px] text-ink-2" data-testid="sop-no-sessions">
            No completed sessions in this view yet. Try a longer date range, another shift or another station.
          </p>
        )}
        <Table testId="sop-steps" minWidth={880}>
          <thead>
            <tr>
              <Th className="w-12">#</Th>
              <Th>Step</Th>
              <Th>Target CT</Th>
              <Th>Median actual</Th>
              <Th>Sessions</Th>
              <Th>First-time correct</Th>
              <Th>
                <span className="sr-only">Propose</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.step} data-step={s.step}>
                <Td>{s.step}</Td>
                <Td>{STEPS[s.step - 1].name}</Td>
                <Td data-testid="target-ct">{mmss(active.steps[s.step - 1]?.targetCtSeconds ?? null)}</Td>
                <Td data-testid="median">{s.medianSeconds === null ? "—" : mmss(s.medianSeconds)}</Td>
                <Td data-testid="sessions">{s.sessions}</Td>
                <Td data-testid="ftc">{s.firstTimeCorrect === null ? "—" : `${s.firstTimeCorrect}%`}</Td>
                <Td className="py-1.5 text-right">
                  <Link href={`/dashboard/sop/new?step=${s.step}&${q}`} className={buttonClass("secondary", "min-h-[48px] text-[15px]")}>
                    Propose a better way
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
      <Cautions />
    </>
  );
}

export default function SopPage(props: PageProps<"/dashboard/sop">) {
  return (
    <Gate area="dashboard" next="/dashboard/sop">
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
