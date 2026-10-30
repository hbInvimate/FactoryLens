// /tasks: the Quality Technician's home after sign-in. One task is one first-off check to do; its status
// follows the check started from it. Only work still to do: Not started, In progress and Paused. Finished checks
// (Completed, Closed, Left) are in Past sessions.
import { connection } from "next/server";
import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import Link from "next/link";
import { ButtonLink, Card, Chip, cx, type ChipTone } from "@/components/ds";
import { BigRing } from "@/components/check/CheckMetrics";
import { CountUp } from "@/components/ds/CountUp";
import { StatusChip } from "@/components/StatusChip";
import { HeroStart } from "@/components/tasks/HeroStart";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { RFT_GOAL_PERCENT } from "@/lib/config";
import { confTone } from "@/lib/conformance-tone";
import { fmtClock } from "@/lib/format";
import { getRepo } from "@/lib/server/repo";
import { techHome, type TechHome } from "@/lib/server/techHome";
import { STEP_COUNT, STEPS, TOTAL_CHECK_POINTS } from "@/lib/sop";
import { LocalTime } from "@/components/LocalTime";
import { OpenTask } from "@/components/tasks/OpenTask";
import { TechShell } from "@/components/tasks/TechShell";
import { currentUser } from "@/lib/auth/server";
import { NotConfigured } from "@/lib/server/repo";
import { activeRevision } from "@/lib/server/sop";
import { bannerFor } from "@/lib/server/sopActivate";
import { SopBanner } from "@/components/SopBanner";
import { PRIORITY_LABEL, TASK_STATUS_LABEL, listOwnChecks, listTasks, type Priority, type Task } from "@/lib/server/tasks";

export const metadata = { title: "FactoryLens AI: Sessions" };

const PRIORITY_TONE: Record<Priority, ChipTone> = { high: "red", medium: "amber", low: "gray" };

const isActive = (t: Task) => t.status === "not_started" || t.status === "in_progress";
const isPaused = (t: Task) => t.status === "in_progress" && t.sessionStatus === "paused";

async function Body({ searchParams }: { searchParams: PageProps<"/tasks">["searchParams"] }) {
  await searchParams;
  await connection();
  const user = await currentUser();
  if (!user) return null;

  let tasks: Task[];
  let checks: Task[];
  let rev;
  let banner;
  let home: TechHome;
  try {
    [tasks, checks, rev, banner] = await Promise.all([listTasks(user), listOwnChecks(user), activeRevision(), bannerFor(user.id)]);
    home = await techHome(user, await getRepo().stations());
  } catch (e) {
    if (e instanceof NotConfigured) return <Card className="px-6 py-5 text-[17px]">{e.message}</Card>;
    throw e;
  }
  // Assigned tasks and checks started without a task (older ones), in one list, newest first.
  tasks = [...tasks, ...checks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // In progress first, then paused, then not started; newest first within each.
  const order = (t: Task) => (t.status === "in_progress" ? (isPaused(t) ? 1 : 0) : 2);
  const list = tasks.filter(isActive).sort((a, b) => order(a) - order(b));
  const active = tasks.filter(isActive).length;
  const rftPct = home.rft.of ? Math.round((home.rft.right / home.rft.of) * 100) : null;
  const takt = home.sop.takt === null ? null : fmtClock(home.sop.takt * 1000);
  const CARD = "flex min-h-[150px] min-w-0 items-center gap-4 rounded-[22px] border border-line bg-surface px-[22px] py-5 shadow-card";

  return (
    <>
      {/* A new Active SOP revision, once per Quality Technician. */}
      {banner && <SopBanner {...banner} />}
      <div className="flex flex-col">
        <h1 className="text-[30px] font-bold" data-testid="greeting">
          {home.greeting}
        </h1>
        <p className="text-[16px] text-muted">
          {ROLE_LABEL[user.role]} · {home.cell} · {home.shift}
        </p>
      </div>

      <HeroStart
        operatorName={user.name}
        parts={home.parts}
        stations={home.stations}
        last={home.last}
        sop={{ id: rev.id, label: rev.label }}
        meta={`${STEP_COUNT} steps · ${TOTAL_CHECK_POINTS} check points${takt ? ` · takt ${takt}` : ""}`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className={CARD} data-testid="stat-today">
          <BigRing value={home.today.complete} of={home.today.started} size={96} stroke={10} />
          <span className="flex min-w-0 flex-col">
            <span className="text-[15px] text-muted">Checks today</span>
            <span className="text-[26px] leading-tight font-bold">{home.today.started === 0 ? "None yet" : home.today.complete === home.today.started ? "All complete" : "In progress"}</span>
            <span className="text-[14px] text-muted">{home.today.started - home.today.complete} left</span>
          </span>
        </div>
        <div className={CARD} data-testid="stat-rft">
          <span className="relative flex size-24 flex-none items-center justify-center">
            {/* 96 px, stroke 10 px: 13.3 in the 128 viewBox. */}
            <svg viewBox="0 0 128 128" className="absolute inset-0 size-24 -rotate-90" aria-hidden>
              <circle cx="64" cy="64" r="57.3" fill="none" stroke="var(--fl-border)" strokeWidth="13.3" />
              {rftPct !== null && (
                <circle cx="64" cy="64" r="57.3" fill="none" stroke={rftPct < RFT_GOAL_PERCENT ? "var(--fl-amber)" : "var(--fl-primary)"} strokeWidth="13.3" strokeLinecap="round" strokeDasharray={2 * Math.PI * 57.3} strokeDashoffset={2 * Math.PI * 57.3 * (1 - rftPct / 100)} className="ring-fill" />
              )}
            </svg>
            <span className={cx("relative text-[20px] font-bold", rftPct === null ? "text-muted" : rftPct < RFT_GOAL_PERCENT ? "text-amber-ink" : "text-primary-ink")}>{rftPct === null ? "—" : <CountUp text={`${rftPct}%`} />}</span>
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-[15px] text-muted">Right first time</span>
            <span className="text-[26px] leading-tight font-bold">
              {home.rft.right} of {home.rft.of}
            </span>
            <span className="text-[14px] text-muted">your last 8 weeks · goal {RFT_GOAL_PERCENT}%</span>
          </span>
        </div>
        <div className={cx(CARD, "flex-col items-start gap-1")} data-testid="stat-cycle">
          <span className="text-[15px] text-muted">Avg cycle time</span>
          <span className="text-[40px] leading-none font-bold tabular-nums">{home.avgCycleSeconds === null ? "—" : fmtClock(home.avgCycleSeconds * 1000)}</span>
          <span className="text-[14px] text-muted">
            {takt ? `takt ${takt}` : "no takt"}
            {home.avgCycleSeconds !== null && home.sop.takt !== null && (home.avgCycleSeconds <= home.sop.takt * 0.8 ? " · well under" : home.avgCycleSeconds <= home.sop.takt ? " · under" : " · over")}
          </span>
        </div>
        <div className={cx(CARD, "flex-col items-start gap-1")} data-testid="stat-streak">
          <span className="text-[15px] text-muted">Streak</span>
          <span className={cx("text-[40px] leading-none font-bold", home.streak ? "text-primary-ink" : "text-ink")}>
            <CountUp text={String(home.streak)} />
            {home.streak > 0 && " ✓"}
          </span>
          <span className="text-[14px] text-muted">right first time in a row</span>
        </div>
      </div>

      {/* Each card only as tall as its content. */}
      <div className="grid items-start gap-4 xl:grid-cols-[1.6fr_1fr]">
      <section className="flex min-w-0 flex-col gap-4 rounded-[22px] border border-line bg-surface px-6 py-5 shadow-card" data-testid="assigned">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="flex-1 text-[22px] font-bold">Assigned to you</h2>
          <span className="text-[14px] text-muted">Not started · In progress · Paused</span>
        </div>

      {/* One big row per check still to do. */}
      {active > 0 && (
        <ul className="flex flex-col gap-3" data-testid="tasks-table">
          {list.map((t) => {
            const paused = isPaused(t);
            const going = t.status === "in_progress" && !paused;
            const done = t.check?.stepsDone ?? 0;
            const step = Math.min(t.check?.currentStep ?? 1, STEP_COUNT);
            return (
              <li
                key={`${t.kind}-${t.id}`}
                data-row
                data-task={t.kind === "task" ? t.id : undefined}
                data-session={t.sessionId ?? undefined}
                data-status={t.status}
                className={cx("flex items-center gap-4 rounded-[18px] bg-surface p-[18px]", going ? "border-2 border-primary" : "border border-line")}
              >
                <BigRing value={done} of={STEP_COUNT} size={60} stroke={7} tone={going ? "amber" : paused ? "grey" : "green"} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <b className="text-[20px] leading-tight break-words">{t.title}</b>
                    <span
                      className={cx("inline-flex flex-none items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold", going ? "bg-amber-soft text-amber-ink" : "bg-surface-2 text-ink-2")}
                      data-testid="task-status"
                    >
                      <span aria-hidden className={cx("size-2 rounded-full", going ? "bg-amber" : paused ? "bg-line-strong" : "bg-primary")} />
                      {paused ? "Paused" : TASK_STATUS_LABEL[t.status]}
                    </span>
                    {t.priority && (
                      <Chip tone={PRIORITY_TONE[t.priority]} size="sm">
                        {PRIORITY_LABEL[t.priority]}
                      </Chip>
                    )}
                  </div>
                  <p className="truncate text-[15px] text-ink-2">
                    {t.station}
                    {t.check ? (
                      <>
                        {" "}
                        · step {step}: {STEPS[step - 1].name} · {paused ? "paused" : "started"} <LocalTime iso={paused ? t.check.updatedAt : t.check.startedAt} />
                      </>
                    ) : (
                      <>
                        {" "}
                        · not started · assigned <LocalTime iso={t.createdAt} />
                      </>
                    )}
                  </p>
                </div>
                {t.kind === "task" ? (
                  <OpenTask task={t} operatorName={user.name} sop={{ id: rev.id, label: rev.label }} big />
                ) : (
                  <ButtonLink variant="primary" href={`/check/${t.id}`} className="min-h-[56px] px-7 text-[18px] font-bold whitespace-nowrap" aria-label={`Resume ${t.title}`}>
                    ▶ Resume
                  </ButtonLink>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {active === 0 && (
        <p className="rounded-[16px] border-2 border-dashed border-line px-6 py-6 text-center text-[16px] text-muted" data-testid="none-assigned">
          No checks assigned to you right now. Your supervisor&apos;s checks show up here, or start one above.
        </p>
      )}

        <h2 className="pt-2 text-[22px] font-bold">Recent checks</h2>
        {home.recent.length === 0 ? (
          <p className="text-[15px] text-muted">No completed checks yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line" data-testid="recent-checks">
            {home.recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3 text-[16px]" data-session={r.id}>
                <b className="whitespace-nowrap">
                  <LocalTime iso={r.finishedAt} />
                </b>
                <span className="min-w-[160px] flex-1">
                  {r.part} · {r.station.split(" · ")[0]}
                </span>
                <StatusChip status={r.status} />
                <span className="w-16 text-right tabular-nums">{r.cycleSeconds === null ? "—" : fmtClock(r.cycleSeconds * 1000)}</span>
                <b className={cx("w-16 text-right text-[18px]", confTone(r.conformance))}>{r.conformance === null ? "—" : `${r.conformance}%`}</b>
              </li>
            ))}
          </ul>
        )}
        <Link href="/sessions" className="w-fit font-semibold text-primary-ink underline">
          See all past sessions
        </Link>
      </section>

      <section className="flex min-w-0 flex-col gap-3 rounded-[22px] border border-line bg-surface px-6 py-5 shadow-card" data-testid="before-you-start">
        <h2 className="text-[22px] font-bold">Before you start</h2>
        <div className="flex gap-3 rounded-[14px] bg-surface-2 px-4 py-3" data-testid="tip">
          <span className="flex size-9 flex-none items-center justify-center rounded-[10px] bg-primary text-[14px] font-bold text-on-strong">AI</span>
          <p className="text-[15px]">
            {home.tip ? (
              <>
                <b className="text-primary-ink">{home.tip.lead}</b> {home.tip.text}
              </>
            ) : home.recentClean ? (
              <>
                <b className="text-primary-ink">Clean run.</b> Your last {home.recentClean} {home.recentClean === 1 ? "check was" : "checks were"} right first time.
              </>
            ) : (
              "No completed checks yet: tips come from your own checks."
            )}
          </p>
        </div>
        <div className="flex gap-3 rounded-[14px] bg-surface-2 px-4 py-3" data-testid="glasses">
          <span className="flex size-9 flex-none items-center justify-center rounded-[10px] border border-line-strong bg-surface text-muted">◉</span>
          <p className="text-[15px]">
            <b>Glasses and camera</b> · no status reported yet. The app gets no data from the glasses so far.
          </p>
        </div>
        <div className="flex gap-3 rounded-[14px] bg-surface-2 px-4 py-3" data-testid="sop-version">
          <span className="flex size-9 flex-none items-center justify-center rounded-[10px] border border-primary-line bg-primary-soft text-primary-ink">≡</span>
          <p className="text-[15px]">
            <b>SOP rev {home.sop.label}</b>
            {home.sop.activatedAt && (
              <>
                {" "}
                · last updated <LocalTime iso={home.sop.activatedAt} dateOnly />
              </>
            )}{" "}
            · {home.sop.changedSinceLast ? <b className="text-amber-ink">changed since your last check</b> : "no changes since your last check"}
          </p>
        </div>
      </section>
      </div>
    </>
  );
}

export default function TasksPage(props: PageProps<"/tasks">) {
  return (
    <Gate area="check" next="/tasks">
      <TechShell current="tasks">
        <main className="page-main flex flex-col gap-5">
          <Suspense fallback={<p className="text-[17px] text-muted">Loading sessions…</p>}>
            <Body searchParams={props.searchParams} />
          </Suspense>
        </main>
      </TechShell>
    </Gate>
  );
}