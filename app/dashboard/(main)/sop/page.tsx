// /dashboard/sop (docs/sop-management/screens/s1): the Active revision, how each step is performed, and the
// revisions. Quality Engineer and admin only. FactoryLens AI shows the data; the Quality Engineer decides.
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import { Card, Page, Skeleton } from "@/components/dashboard/light";
import { Filters } from "@/components/dashboard/Filters";
import { ButtonLink, Chip, Table, Td, Th, cx } from "@/components/ds";
import { Cautions, RevisionChip, SampleChip, StatusChip } from "@/components/sop/parts";
import { sopName } from "@/lib/sop-revisions";
import { CandidatesCard, TrendCard } from "@/components/sop/TrendAndCandidates";
import { RollbackButton } from "@/components/sop/RollbackButton";
import { DiscardDraftButton } from "@/components/sop/DiscardDraftButton";
import { checkRows, findCandidates } from "@/lib/sop-candidates";
import { LocalTime } from "@/components/LocalTime";
import { activeCheckMs, reduce } from "@/lib/check/reducer";
import { dashView } from "@/lib/server/dashView";
import { NotConfigured } from "@/lib/server/repo";
import { activeRevision } from "@/lib/server/sop";
import { completedSessions, medianCheckSeconds, nextLabel, revisions } from "@/lib/server/sopData";
import { STEPS } from "@/lib/sop";
import { checkTargetSeconds } from "@/lib/sop-revisions";
import { mmss, percentile, stepStats } from "@/lib/sop-stats";

export const metadata = { title: "FactoryLens AI: SOP history" };

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
  const [active, revs, sessions, realSessions] = await Promise.all([
    activeRevision(),
    revisions(),
    completedSessions(f),
    // Candidates always use real checks only, whatever the sample switch says.
    f.includeSample ? completedSessions({ ...f, includeSample: false }) : null,
  ]);
  const found = findCandidates(realSessions ?? sessions, active.steps.map((s) => s.targetCtSeconds));
  const trendRows = checkRows(sessions).filter((r) => r.checkSeconds !== null).sort((a, b) => a.startedAt - b.startedAt);
  const trendMedian = percentile(trendRows.map((r) => r.checkSeconds as number), 0.5);
  const stats = stepStats(sessions);
  const target = checkTargetSeconds(active);
  const medianCheck = medianCheckSeconds(sessions.map((s) => {
    const ms = activeCheckMs(reduce(s.actions, s.startedAt));
    return ms === null ? null : ms / 1000;
  }));
  const activeSummary = revs.find((r) => r.id === active.id);
  const sample = sessions.filter((s) => s.isSample).length;
  const FTC_GOAL = 90;
  const KPI = "flex min-w-0 flex-col justify-center gap-1 rounded-[20px] border border-line bg-surface px-6 py-5 shadow-card";
  const CARD = "flex min-w-0 flex-col gap-3 rounded-[22px] border border-line bg-surface px-6 py-5 shadow-card";
  const scored = stats.filter((x) => x.firstTimeCorrect !== null);
  const ftcAll = scored.length ? Math.round(scored.reduce((n, x) => n + (x.firstTimeCorrect as number), 0) / scored.length) : null;
  const lowSteps = scored.filter((x) => (x.firstTimeCorrect as number) < FTC_GOAL).map((x) => x.step);
  const targetOf = (n: number) => active.steps[n - 1]?.targetCtSeconds ?? null;
  const loose = target !== null && medianCheck !== null && medianCheck < target * 0.5 && stats.every((x) => x.medianSeconds === null || targetOf(x.step) === null || x.medianSeconds < (targetOf(x.step) as number));
  const next = nextLabel(revs.map((r) => r.label).concat("A"));
  const counts = { active: revs.filter((r) => r.status === "active").length, discarded: revs.filter((r) => r.status === "discarded").length, pending: revs.filter((r) => r.status === "draft").length, retired: revs.filter((r) => r.status === "retired").length };
  const list = (n: number[]) => (n.length === 1 ? `Step ${n[0]} is` : `Steps ${n.slice(0, -1).join(", ")} and ${n[n.length - 1]} are`);
  const lead = sessions.length === 0 ? "No completed checks yet." : loose ? "Targets look loose." : lowSteps.length ? "Some steps miss first-time correct." : "Targets and first-time correct look healthy.";
  const detail = [
    loose ? `Every step runs far under target (check median ${mmss(medianCheck)} vs ${mmss(target)}).` : null,
    lowSteps.length ? `${list(lowSteps)} under ${FTC_GOAL}% first-time correct.` : null,
    loose || lowSteps.length ? `Consider ${[loose ? "tighter targets" : null, lowSteps.length ? `a note for step${lowSteps.length === 1 ? "" : "s"} ${lowSteps.join(", ")}` : null].filter(Boolean).join(" and ")}.` : null,
  ].filter(Boolean).join(" ");
  const suggest = [loose ? "Tighten the step targets towards the measured medians" : null, lowSteps.length ? `add a note for step${lowSteps.length === 1 ? "" : "s"} ${lowSteps.join(", ")}` : null].filter(Boolean).join("; ");
  const closest = [...found.streaks].filter((x) => !found.candidates.some((c) => c.who === x.who)).sort((a, b) => b.streak - a.streak || b.checks - a.checks)[0] ?? null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="flex flex-col">
          <h1 className="text-[30px] leading-tight font-bold">SOP history</h1>
          <p className="text-[15px] text-muted">
            First-off check, B-pillar outer · {params.station}
          </p>
        </div>
        <span className="flex-1" />
        <Filters stations={stations} params={params} base="/dashboard/sop" />
        {params.sample && <SampleChip real={sessions.length - sample} sample={sample} />}
        <ButtonLink variant="primary" href={`/dashboard/update-sop?station=${encodeURIComponent(params.station)}`}>
          Update SOP
        </ButtonLink>
      </div>

      <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div className="flex min-w-0 items-center gap-4 rounded-[20px] border border-primary-line bg-primary-soft px-6 py-5" data-testid="active-revision">
          <span className="flex size-16 flex-none items-center justify-center rounded-[16px] bg-primary text-[30px] font-bold text-on-strong">{active.label}</span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[14px] text-ink-2">Active revision</span>
            <b className="text-[26px] leading-tight">
              Rev {active.label}
              {active.label === "A" ? " · Baseline" : ""}
            </b>
            <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
              <RevisionChip label={active.label} status="active" />
              {activeSummary?.activatedAt ? (
                <span>
                  since <LocalTime iso={activeSummary.activatedAt} /> · 12 steps
                </span>
              ) : (
                <span>12 steps{active.id === null ? " · from lib/sop.ts" : ""}</span>
              )}
            </span>
          </span>
        </div>
        <div className={KPI} data-testid="check-ct-target">
          <span className="text-[14px] text-muted">Check CT · target vs actual</span>
          <span>
            <b className="text-[36px] leading-tight tabular-nums">{mmss(medianCheck)}</b> <span className="text-[18px] text-muted">/ {target === null ? "not set" : mmss(target)}</span>
          </span>
          <span className="text-[13px] text-ink-2">
            {target !== null && medianCheck !== null ? `median is ${Math.round((medianCheck / target) * 100)}% of target` : target === null ? "target set when all 12 steps have one" : "no completed checks yet"}
          </span>
        </div>
        <div className={KPI}>
          <span className="text-[14px] text-muted">First-time correct</span>
          <b className={cx("text-[36px] leading-tight", ftcAll !== null && ftcAll < FTC_GOAL ? "text-amber-ink" : "text-primary-ink")}>{ftcAll === null ? "—" : `${ftcAll}%`}</b>
          <span className="text-[13px] text-ink-2">
            {sessions.length} completed {sessions.length === 1 ? "check" : "checks"}
          </span>
        </div>
        <div className={KPI}>
          <span className="text-[14px] text-muted">Revisions</span>
          <b className="text-[36px] leading-tight">{Math.max(1, revs.length)}</b>
          <span className="text-[13px] text-ink-2">
            {counts.active || 1} active · {counts.discarded} discarded · {counts.pending} pending{counts.retired ? ` · ${counts.retired} retired` : ""}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 rounded-[20px] border border-primary-line bg-primary-soft px-5 py-4" data-testid="sop-ai-banner">
        <span className="flex size-10 flex-none items-center justify-center rounded-[12px] bg-primary text-[15px] font-bold text-on-strong">AI</span>
        <p className="min-w-0 flex-1 text-[16px] text-ink">
          <b className="text-primary-ink">{lead}</b> {detail}
        </p>
        {suggest && (
          <ButtonLink variant="primary" href={`/dashboard/update-sop?station=${encodeURIComponent(params.station)}${lowSteps.length ? `&step=${lowSteps[0]}` : ""}&suggest=${encodeURIComponent(`Rev ${next}: ${suggest}.`)}`} data-testid="draft-next-rev">
            Draft Rev {next}
          </ButtonLink>
        )}
      </div>

      <div className="grid items-stretch gap-4 xl:grid-cols-2">
        <TrendCard rows={trendRows} medianSeconds={trendMedian === null ? null : Math.round(trendMedian)} targetSeconds={target} highlight={found.candidates[0] ?? null} sample={params.sample} />
        <CandidatesCard candidates={found.candidates} view={{ station: params.station, range: params.range, shift: params.shift ?? "all" }} closest={closest} />

        <section className={CARD} data-testid="revisions">
          <div className="flex items-start gap-3">
            <div className="flex flex-1 flex-col">
              <h2 className="text-[20px] font-semibold">Revisions</h2>
              <p className="text-[14px] text-muted">Every change is recorded and can be rolled back</p>
            </div>
            <Chip tone="green" size="sm">
              Rev {active.label} active
            </Chip>
          </div>
          <ul className="flex flex-col gap-2.5">
            {revs.length === 0 && <li className="py-2 text-[15px] text-muted">No revisions in the database yet. The SOP in lib/sop.ts is used.</li>}
            {revs.map((r, i) => {
              const on = r.status === "active";
              const what = r.label === "A" ? "Baseline" : r.sourceLabel ? `From checks by ${r.sourceLabel}` : r.changeReason ?? "Changes";
              const changes = r.label === "A" ? `12 steps · ${mmss(target)}` : r.changes.map((c) => `Step ${c.step} target ${mmss(c.newCtSeconds)}`).join(" · ") || "No changes yet";
              return (
                <li key={r.id} data-revision={r.label} data-status={r.status} className="grid grid-cols-[40px_1fr] gap-3">
                  <span className="flex flex-col items-center gap-1">
                    <span className={cx("flex size-9 items-center justify-center rounded-[10px] text-[15px] font-bold", on ? "bg-primary text-on-strong" : "bg-surface-2 text-ink-2")}>{r.label}</span>
                    {i < revs.length - 1 && <span className="w-px flex-1 bg-line" />}
                  </span>
                  <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] border px-4 py-2.5", on ? "border-primary-line bg-primary-soft" : "border-line bg-surface")}>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[15px]">
                        <b>Rev {r.label}</b> · {what}
                      </span>
                      <span className="text-[13px] text-muted">
                        {changes} · {r.status === "draft" ? r.createdBy ?? "" : <LocalTime iso={r.activatedAt ?? r.createdAt} />}
                      </span>
                    </span>
                    <StatusChip status={r.status} />
                    {!on && (
                      <Link href={`/dashboard/sop/review/${encodeURIComponent(r.id)}`} className="text-[14px] font-semibold text-primary-ink underline">
                        {r.status === "draft" ? `Open the review of revision ${r.label}` : "Compare"}
                      </Link>
                    )}
                    {r.status === "draft" && <DiscardDraftButton revisionId={r.id} label={r.label} />}
                    {r.status === "retired" && <RollbackButton revisionId={r.id} label={r.label} />}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className={CARD} data-testid="revision-glance">
          <div>
            <h2 className="text-[20px] font-semibold">Active revision at a glance</h2>
            <p className="text-[14px] text-muted">
              Rev {active.label} · {sopName(active.label)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {STEPS.map((st) => {
              const ftc = stats[st.n - 1]?.firstTimeCorrect ?? null;
              const low = ftc !== null && ftc < FTC_GOAL;
              return (
                <div key={st.n} data-step={st.n} className={cx("flex flex-col rounded-[12px] border px-3 py-2", low ? "border-amber-line bg-amber-soft" : "border-primary-line bg-primary-soft")}>
                  <b className={cx("text-[12px] uppercase", low ? "text-amber-ink" : "text-primary-ink")}>Step {st.n}</b>
                  <span className="truncate text-[14px] font-semibold" title={st.name}>
                    {st.name}
                  </span>
                  <span className="text-[12px] text-ink-2">target {mmss(targetOf(st.n))}</span>
                </div>
              );
            })}
          </div>
          <span className="flex flex-wrap gap-x-3 text-[13px] text-muted">
            <span><i className="mr-1 inline-block size-2.5 rounded-sm border border-primary-line bg-primary-soft" />≥ {FTC_GOAL}% first-time correct</span>
            <span><i className="mr-1 inline-block size-2.5 rounded-sm border border-amber-line bg-amber-soft" />below {FTC_GOAL}%</span>
            <span>· Target CT {target === null ? "not set" : mmss(target)} = sum of 12 step targets</span>
          </span>
        </section>
      </div>

      <section className={CARD}>
        <div>
          <h2 className="text-[20px] font-semibold">How each step is performed</h2>
          <p className="text-[14px] text-muted">
            Completed checks, {params.sample ? "including SAMPLE data" : "real data only"} · bar = median as a share of the step target · FactoryLens AI shows data, the Quality Engineer decides
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
              <Th className="w-[34%]">Median vs target</Th>
              <Th>Actual / target</Th>
              <Th>Checks</Th>
              <Th className="w-[200px]">First-time correct</Th>
            </tr>
          </thead>
          <tbody>
            {stats.map((x) => {
              const t = targetOf(x.step);
              const over = x.medianSeconds !== null && t !== null && x.medianSeconds > t;
              const low = x.firstTimeCorrect !== null && x.firstTimeCorrect < FTC_GOAL;
              return (
                <tr key={x.step} data-step={x.step}>
                  <Td>{x.step}</Td>
                  <Td>{STEPS[x.step - 1].name}</Td>
                  <Td>
                    <span className="block h-2.5 rounded-full bg-surface-2">
                      {x.medianSeconds !== null && <span className={cx("bar-grow block h-full rounded-full", over ? "bg-amber" : "bg-primary")} style={{ width: `${Math.max(2, Math.min(1, t ? x.medianSeconds / t : 1) * 100)}%` }} />}
                    </span>
                  </Td>
                  <Td className="tabular-nums">
                    <b data-testid="median">{x.medianSeconds === null ? "—" : mmss(x.medianSeconds)}</b> <span className="text-muted">/ <span data-testid="target-ct">{mmss(t)}</span></span>
                  </Td>
                  <Td data-testid="sessions">{x.sessions}</Td>
                  <Td>
                    <span className="flex items-center gap-3">
                      <span className="h-2 flex-1 rounded-full bg-surface-2">
                        {x.firstTimeCorrect !== null && <span className={cx("block h-full rounded-full", low ? "bg-amber" : "bg-primary")} style={{ width: `${x.firstTimeCorrect}%` }} />}
                      </span>
                      <b className={cx("w-12 text-right", low ? "text-amber-ink" : "text-primary-ink")} data-testid="ftc">
                        {x.firstTimeCorrect === null ? "—" : `${x.firstTimeCorrect}%`}
                      </b>
                    </span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </section>
      <Cautions />
    </>
  );
}

export default function SopPage(props: PageProps<"/dashboard/sop">) {
  return (
    <Gate area="dashboard" next="/dashboard/sop">
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
