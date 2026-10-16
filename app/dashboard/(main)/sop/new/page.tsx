// /dashboard/sop/new?step=N (docs/sop-management/screens/s2): wizard stages 1 and 2. Pick the operation,
// then the Quality Engineer decides the new CT with the evidence. Stages 3 and 4 stay locked until then.
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import { Card, Page, Skeleton } from "@/components/dashboard/light";
import { StatTile } from "@/components/ds";
import { IconClock, IconChecklist, IconTarget, IconChart } from "@/components/ds/icons";
import { Cautions, SampleChip } from "@/components/sop/parts";
import { CtDecision } from "@/components/sop/CtDecision";
import { currentUser } from "@/lib/auth/server";
import { MIN_EVIDENCE_SESSIONS, MIN_EVIDENCE_SHIFTS, SHOW_TECHNICIAN_IN_EVIDENCE } from "@/lib/config";
import { parseDev } from "@/lib/dashboard/params";
import { dashView, viewQuery } from "@/lib/server/dashView";
import { NotConfigured } from "@/lib/server/repo";
import { activeRevision } from "@/lib/server/sop";
import { completedSessions, revisionTargets, revisions } from "@/lib/server/sopData";
import { STEPS } from "@/lib/sop";
import { mmss, stepAnalysis } from "@/lib/sop-stats";
import { cx } from "@/components/ui";

export const metadata = { title: "FactoryLens AI: new SOP revision" };

const STAGES = ["Pick the operation", "Decide the new CT", "Write the better way", "Review and activate"];

function StagePills() {
  return (
    <ol className="flex flex-wrap gap-2" aria-label="Wizard stages" data-testid="wizard-stages">
      {STAGES.map((s, i) => (
        <li
          key={s}
          aria-current={i === 1 ? "step" : undefined}
          className={cx(
            "rounded-full px-3 py-1 text-[14px] font-semibold",
            i === 0 && "bg-primary-soft text-primary-ink",
            i === 1 && "bg-primary text-on-strong",
            i > 1 && "text-muted",
          )}
        >
          {i + 1} {s}
          {i === 0 && " ✓"}
          {i > 1 && <span className="sr-only"> (locked until the new CT is saved)</span>}
        </li>
      ))}
    </ol>
  );
}

async function Body({ searchParams }: { searchParams: PageProps<"/dashboard/sop/new">["searchParams"] }) {
  const sp = await searchParams;
  await connection();
  const step = parseDev(sp.step);
  if (!step) {
    return (
      <Card className="px-5 py-4">
        <h1 className="text-[22px] font-semibold">Pick a step first</h1>
        <p className="text-[15px] text-ink-2">
          Open <Link href="/dashboard/sop" className="font-semibold text-primary-ink underline">SOP management</Link> and click &quot;Propose a better way&quot; on one of the 12 steps.
        </p>
      </Card>
    );
  }
  let view;
  try {
    view = await dashView(sp);
  } catch (e) {
    if (e instanceof NotConfigured) return <Card className="px-5 py-4">The database is not set up. See the README: Set up the database.</Card>;
    throw e;
  }
  const { params, f } = view;
  const [active, revs, sessions, user] = await Promise.all([activeRevision(), revisions(), completedSessions(f), currentUser()]);
  const { stat, evidence } = stepAnalysis(sessions, step);
  const draft = revs.find((r) => r.status === "draft") ?? null;
  const currentTarget = active.steps[step - 1]?.targetCtSeconds ?? null;
  // The new CT goes into the open draft if there is one, else into a new draft copied from the Active revision.
  const targets = draft ? await revisionTargets(draft.id) : active.steps.map((s) => s.targetCtSeconds);
  const sample = sessions.filter((s) => s.isSample).length;
  const def = STEPS[step - 1];

  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="text-[14px] text-muted">
          <Link href={`/dashboard/sop?${viewQuery(params)}`} className="hover:underline">
            SOP management
          </Link>{" "}
          / New revision
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[30px] font-bold">
            Step {step}: {def.name}
          </h1>
          <span className="flex-1" />
          {params.sample && <SampleChip real={sessions.length - sample} sample={sample} />}
        </div>
        <StagePills />
      </div>

      <div className="grid gap-4">
        <div className="flex flex-col gap-4">
          <section aria-label="1. Pick the operation" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile icon={<IconTarget />} tone="green" value={mmss(currentTarget)} label="Current target CT" testId="stat-target" />
            <StatTile icon={<IconClock />} tone="blue" value={stat.medianSeconds === null ? "—" : mmss(stat.medianSeconds)} label="Median actual" testId="stat-median" />
            <StatTile icon={<IconChart />} tone="violet" value={stat.fastestQuarterSeconds === null ? "—" : mmss(stat.fastestQuarterSeconds)} label="Fastest quarter" testId="stat-fastest" />
            <StatTile icon={<IconChecklist />} tone="amber" value={stat.firstTimeCorrect === null ? "—" : `${stat.firstTimeCorrect}%`} label="First-time correct" testId="stat-ftc" />
          </section>
          <p className="text-[14px] text-ink-2" data-testid="stat-by-shift">
            <b data-testid="stat-sessions">{stat.sessions}</b> completed {stat.sessions === 1 ? "session" : "sessions"} ({params.sample ? "including sample data" : "real only"}). Median by shift:{" "}
            {stat.byShift.map((s) => `${s.shift} ${s.medianSeconds === null ? "—" : mmss(s.medianSeconds)} (${s.sessions})`).join(" · ")}. Fastest quarter: a quarter of the sessions were this fast or faster.
          </p>
          <CtDecision
            step={step}
            currentTarget={currentTarget}
            targets={targets}
            draftLabel={draft?.label ?? null}
            evidence={evidence.map((e) => ({ ...e, operator: SHOW_TECHNICIAN_IN_EVIDENCE ? e.operator : null }))}
            showTechnician={SHOW_TECHNICIAN_IN_EVIDENCE}
            decidedBy={user?.name ?? ""}
            minimum={{ sessions: MIN_EVIDENCE_SESSIONS, shifts: MIN_EVIDENCE_SHIFTS }}
            backHref={`/dashboard/sop?${viewQuery(params)}`}
            aside={<Cautions />}
          />
        </div>
      </div>
    </>
  );
}

export default function NewRevisionPage(props: PageProps<"/dashboard/sop/new">) {
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
