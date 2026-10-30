// /supervisor/live/[id]: the Supervisor watches one check. Steps with their times, the live view (a placeholder until
// the glasses stream video), the values at the current step and the activity, newest first. Read-only; refreshes
// every 5 seconds while the check has not ended.
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import { Card, Chip, cx, type ChipTone } from "@/components/ds";
import { LocalTime } from "@/components/LocalTime";
import { AutoRefresh, ComingSoon } from "@/components/supervisor/LiveClient";
import { minutes } from "@/components/supervisor/parts";
import { SupervisorShell } from "@/components/supervisor/SupervisorShell";
import { canViewSession } from "@/lib/auth/roles";
import { currentUser } from "@/lib/auth/server";
import { ENDED_STATUSES, STATUS_LABEL, type SessionStatus } from "@/lib/check/types";
import { liveView, type LiveView, type Tone } from "@/lib/server/live";
import { NotConfigured } from "@/lib/server/repo";
import { isSessionId } from "@/lib/server/validate";
import { TOTAL_CHECK_POINTS } from "@/lib/sop";

export const metadata = { title: "FactoryLens AI: Live check" };

const DOT: Record<Tone, string> = { green: "bg-primary", amber: "bg-amber", gray: "bg-line-strong", red: "bg-red" };

function StateChip({ status }: { status: SessionStatus }) {
  if (status === "running")
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-red px-3 py-1 text-[13px] font-bold tracking-wide text-on-strong" data-testid="live-chip">
        <span className="size-2 animate-pulse rounded-full bg-on-strong" aria-hidden />
        LIVE
      </span>
    );
  const tone: ChipTone = status === "paused" ? "amber" : status === "complete" ? "green" : status === "on_hold" || status === "stopped" ? "red" : "gray";
  const text = status === "complete" ? "Completed" : STATUS_LABEL[status];
  return (
    <Chip tone={tone} size="sm">
      <span data-testid="live-chip">{text}</span>
    </Chip>
  );
}

function Stat({ label, value, sub, tone, testId }: { label: string; value: string; sub?: string; tone?: "amber"; testId: string }) {
  return (
    <Card className="flex flex-col gap-0.5 px-4 py-3">
      <span className="text-[13px] text-muted">{label}</span>
      <span className={cx("text-[24px] font-bold", tone === "amber" && "text-amber-ink")} data-testid={testId}>
        {value}
      </span>
      {sub && <span className="text-[13px] text-muted">{sub}</span>}
    </Card>
  );
}

function Steps({ v }: { v: LiveView }) {
  return (
    <Card className="flex flex-col px-3 py-3" testId="live-steps">
      <h2 className="px-2 pb-2 text-[15px] font-semibold">SOP steps</h2>
      <ol className="flex flex-col gap-0.5">
        {v.steps.map((s) => {
          const over = s.seconds !== null && s.targetSeconds !== null && s.seconds > s.targetSeconds;
          return (
            <li
              key={s.n}
              data-step={s.n}
              data-state={s.state}
              className={cx("flex min-h-[40px] items-center gap-2.5 rounded-[8px] px-2 text-[13px]", s.state === "current" && "bg-amber-soft ring-1 ring-amber-line")}
            >
              <span
                className={cx(
                  "flex size-6 flex-none items-center justify-center rounded-full text-[12px] font-bold",
                  s.state === "done" ? "bg-primary text-on-strong" : s.state === "current" ? "bg-amber text-on-amber" : "bg-surface-2 text-muted",
                )}
              >
                {s.n}
              </span>
              <span className={cx("flex-1 leading-tight", s.state === "upcoming" ? "text-muted" : "text-ink")}>{s.name}</span>
              <span className={cx("font-mono text-[13px]", over ? "font-semibold text-amber-ink" : "text-ink-2")} title={s.targetSeconds === null ? undefined : `Target ${minutes(s.targetSeconds)}`}>
                {s.seconds === null ? (s.state === "current" ? "now" : "—") : minutes(s.seconds)}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function Middle({ v }: { v: LiveView }) {
  const recorded = v.now?.values.filter((x) => x.value !== null).length ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex aspect-video min-h-[280px] flex-col items-center justify-center overflow-hidden rounded-card bg-ink pb-10 text-on-strong" data-testid="live-video">
        <span className="text-[15px] font-semibold">Live view from the technician&apos;s glasses</span>
        <span className="text-[13px] opacity-70">Video shows here once the glasses stream it.</span>
        <span className="absolute inset-x-0 bottom-0 bg-ink/80 px-4 py-2.5 text-[14px]" data-testid="live-now">
          {v.now ? (
            <>
              <b>Now:</b> Step {v.now.n} · {v.now.name}
            </>
          ) : (
            <>
              <b>Now:</b> {v.status === "complete" ? "Check complete" : STATUS_LABEL[v.status]}
            </>
          )}
        </span>
      </div>
      <Card className="flex flex-col gap-3 px-4 py-3" testId="live-values">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold">{v.now ? `${v.now.measured ? "Values" : "Points"} at step ${v.now.n}` : "Values at the current step"}</h2>
          {v.now && v.now.values.length > 0 && (
            <span className="text-[13px] text-muted" data-testid="live-values-count">
              {recorded} of {v.now.values.length}
            </span>
          )}
        </div>
        {!v.now || v.now.values.length === 0 ? (
          <p className="text-[13px] text-muted">{v.now ? "Nothing to record at this step." : "No step in progress."}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {v.now.values.map((x) => (
              <li
                key={x.point}
                data-point={x.point}
                data-recorded={x.value !== null || undefined}
                className={cx("rounded-full border px-3 py-1 text-[13px]", x.value !== null ? "border-primary-line bg-primary-soft text-primary-ink" : "border-line bg-surface-2 text-muted")}
              >
                <b>{x.point}</b>
                {x.value !== null && x.value !== "Done" ? ` · ${x.value}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Activity({ v }: { v: LiveView }) {
  return (
    <Card className="flex flex-col px-4 py-3" testId="live-activity">
      <h2 className="pb-2 text-[15px] font-semibold">Activity</h2>
      <ol className="flex flex-col">
        {v.activity.map((e, i) => (
          <li key={i} className="flex gap-2.5 border-b border-line py-2 last:border-0" data-tone={e.tone}>
            <span className="w-[84px] flex-none whitespace-nowrap font-mono text-[12px] leading-5 text-muted">
              <LocalTime iso={e.at} timeOnly />
            </span>
            <span className={cx("mt-1.5 size-2.5 flex-none rounded-full", DOT[e.tone])} aria-hidden />
            <span className="flex-1 text-[13px] leading-5">{e.text}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

async function Body({ params }: { params: PageProps<"/supervisor/live/[id]">["params"] }) {
  const { id } = await params;
  await connection();
  if (!isSessionId(id)) notFound();
  let v: LiveView | null;
  try {
    v = await liveView(id);
  } catch (e) {
    if (e instanceof NotConfigured) return <Card className="px-6 py-5 text-[17px]">{e.message}</Card>;
    throw e;
  }
  const user = await currentUser();
  if (!v || !user || !canViewSession(user, v.ownerId)) notFound();
  const open = !ENDED_STATUSES.includes(v.status);
  const first = v.technician.split(/\s+/)[0];
  return (
    <>
      <AutoRefresh on={open} />
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[24px] font-bold">{v.part} · First-off check</h1>
            <StateChip status={v.status} />
          </div>
          <p className="text-[14px] text-muted" data-testid="live-sub">
            {v.technician} · {v.station} · SOP rev {v.sopLabel} · started <LocalTime iso={v.startedAt} timeOnly />
          </p>
        </div>
        <div className="flex flex-wrap gap-3 pb-5">
          <ComingSoon testId="flag-review">Flag for review</ComingSoon>
          <ComingSoon testId="talk-to">{`Talk to ${first}`}</ComingSoon>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Step" value={`${Math.min(v.current, 12)}/12`} sub={`${v.stepsDone} done`} testId="stat-step" />
        <Stat label="Time elapsed / target" value={`${minutes(v.elapsedSeconds)} / ${minutes(v.targetSeconds)}`} testId="stat-time" />
        <Stat label="Check points" value={`${v.checkPoints}/${TOTAL_CHECK_POINTS}`} testId="stat-points" />
        <Stat
          label="Deviations"
          value={String(v.deviations)}
          tone={v.deviations ? "amber" : undefined}
          sub={v.deviations === 0 ? "None" : v.corrected === v.deviations ? "corrected" : `${v.corrected} of ${v.deviations} corrected`}
          testId="stat-deviations"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,320px)]">
        <Steps v={v} />
        <Middle v={v} />
        <Activity v={v} />
      </div>
    </>
  );
}

export default function LivePage(props: PageProps<"/supervisor/live/[id]">) {
  return (
    <Gate area="supervisor" next="/supervisor/tasks">
      <SupervisorShell current="tasks">
        <main className="page-main flex flex-col gap-4">
          <Link href="/supervisor/tasks" className="inline-flex min-h-[56px] w-fit items-center text-[14px] font-semibold text-primary-ink hover:underline">
            ← Tasks
          </Link>
          <Suspense fallback={<p className="text-[15px] text-muted">Loading the check…</p>}>
            <Body params={props.params} />
          </Suspense>
        </main>
      </SupervisorShell>
    </Gate>
  );
}
