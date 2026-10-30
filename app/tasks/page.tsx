// /tasks: the Quality Technician's home after sign-in. One task is one first-off check to do; its status
// follows the check started from it. Only work still to do: Not started, In progress and Paused. Finished checks
// (Completed, Closed, Left) are in Past sessions.
import Form from "next/form";
import { connection } from "next/server";
import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import Link from "next/link";
import { ButtonLink, Card, Chip, Input, Table, Td, Th, cx, type ChipTone } from "@/components/ds";
import { IconSearch } from "@/components/ds/icons";
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
import { STEP_COUNT, TOTAL_CHECK_POINTS } from "@/lib/sop";
import { LocalTime } from "@/components/LocalTime";
import { AutoSubmitSelect } from "@/components/tasks/AutoSubmit";
import { OpenTask } from "@/components/tasks/OpenTask";
import { TechShell } from "@/components/tasks/TechShell";
import { currentUser } from "@/lib/auth/server";
import { NotConfigured } from "@/lib/server/repo";
import { activeRevision } from "@/lib/server/sop";
import { bannerFor } from "@/lib/server/sopActivate";
import { SopBanner } from "@/components/SopBanner";
import { PRIORITIES, PRIORITY_LABEL, TASK_STATUS_LABEL, listOwnChecks, listTasks, type Priority, type Task, type TaskStatus } from "@/lib/server/tasks";

export const metadata = { title: "FactoryLens AI: Sessions" };

const PRIORITY_TONE: Record<Priority, ChipTone> = { high: "red", medium: "amber", low: "gray" };
const DOT: Record<TaskStatus, string> = { not_started: "bg-line-strong", in_progress: "bg-amber", completed: "bg-primary", closed: "bg-red" };

/** All active, or one of the three states of work still to do. A paused check is its own filter. */
const STATUS_FILTERS = { active: "All active", not_started: "Not started", in_progress: "In progress", paused: "Paused" } as const;
type StatusFilter = keyof typeof STATUS_FILTERS;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const isActive = (t: Task) => t.status === "not_started" || t.status === "in_progress";
const isPaused = (t: Task) => t.status === "in_progress" && t.sessionStatus === "paused";

function matches(task: Task, status: StatusFilter, priority: string, q: string) {
  if (!isActive(task)) return false;
  if (status === "not_started" && task.status !== "not_started") return false;
  if (status === "in_progress" && (task.status !== "in_progress" || isPaused(task))) return false;
  if (status === "paused" && !isPaused(task)) return false;
  if (priority !== "all" && task.priority !== priority) return false;
  const s = q.toLowerCase();
  return !s || [task.title, task.part, task.station, task.assignedName].some((x) => x.toLowerCase().includes(s));
}

async function Body({ searchParams }: { searchParams: PageProps<"/tasks">["searchParams"] }) {
  const sp = await searchParams;
  await connection();
  const user = await currentUser();
  if (!user) return null;
  const statusParam = one(sp.status);
  const status: StatusFilter = statusParam in STATUS_FILTERS ? (statusParam as StatusFilter) : "active";
  const priority = (PRIORITIES as readonly string[]).includes(one(sp.priority)) ? one(sp.priority) : "all";
  const q = one(sp.q).trim().slice(0, 120);

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
  const shown = tasks.filter((t) => matches(t, status, priority, q));
  const active = tasks.filter(isActive).length;
  const rftPct = home.rft.of ? Math.round((home.rft.right / home.rft.of) * 100) : null;
  const takt = home.sop.takt === null ? null : fmtClock(home.sop.takt * 1000);
  const CARD = "flex min-w-0 items-center gap-4 rounded-[22px] border border-line bg-surface px-5 py-4 shadow-card";

  return (
    <>
      {/* A new Active SOP revision, once per Quality Technician. */}
      {banner && <SopBanner {...banner} />}
      <div className="flex flex-col">
        <h1 className="text-[30px] font-bold" data-testid="greeting">
          {home.greeting}, {home.firstName}
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
          <BigRing value={home.today.complete} of={home.today.started} size={92} />
          <span className="flex min-w-0 flex-col">
            <span className="text-[15px] text-muted">Checks today</span>
            <span className="text-[24px] leading-tight font-bold">{home.today.started === 0 ? "None yet" : home.today.complete === home.today.started ? "All complete" : "In progress"}</span>
            <span className="text-[14px] text-muted">{home.today.started - home.today.complete} left</span>
          </span>
        </div>
        <div className={CARD} data-testid="stat-rft">
          <span className="relative flex size-[92px] flex-none items-center justify-center">
            <svg viewBox="0 0 128 128" className="absolute inset-0 size-[92px] -rotate-90" aria-hidden>
              <circle cx="64" cy="64" r="56" fill="none" stroke="var(--fl-border)" strokeWidth="14" />
              {rftPct !== null && (
                <circle cx="64" cy="64" r="56" fill="none" stroke={rftPct < RFT_GOAL_PERCENT ? "var(--fl-amber)" : "var(--fl-primary)"} strokeWidth="14" strokeLinecap="round" strokeDasharray={2 * Math.PI * 56} strokeDashoffset={2 * Math.PI * 56 * (1 - rftPct / 100)} className="ring-fill" />
              )}
            </svg>
            <span className={cx("relative text-[20px] font-bold", rftPct === null ? "text-muted" : rftPct < RFT_GOAL_PERCENT ? "text-amber-ink" : "text-primary-ink")}>{rftPct === null ? "—" : <CountUp text={`${rftPct}%`} />}</span>
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="text-[15px] text-muted">Right first time</span>
            <span className="text-[24px] leading-tight font-bold">
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

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
      <section className="flex min-w-0 flex-col gap-4 rounded-[22px] border border-line bg-surface px-6 py-5 shadow-card" data-testid="assigned">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="flex-1 text-[20px] font-semibold">Assigned to you</h2>
          <span className="text-[14px] text-muted">Not started · In progress · Paused</span>
        </div>

      {/* Nothing to do: only the dashed empty state below. */}
      {active > 0 && (
      <>
      {/* One row: search 320 px, the two dropdowns 200 px, all 44 px tall, 12 px apart; wraps on narrow screens. */}
      <Form
        action="/tasks"
        className="flex flex-wrap items-center gap-3 [&_select]:h-[44px] [&_select]:min-h-[44px]! [&_select]:w-[200px] [&_select]:min-w-0! [&_select]:text-[16px]"
        role="search"
      >
        <span className="relative w-[320px] max-w-full">
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">
            <IconSearch />
          </span>
          <Input name="q" type="search" defaultValue={q} key={q} placeholder="Search session" aria-label="Search session" className="h-[44px] min-h-[44px]! pl-11 text-[16px]" />
        </span>
        <AutoSubmitSelect name="status" value={status} label="Status">
          {Object.entries(STATUS_FILTERS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </AutoSubmitSelect>
        <AutoSubmitSelect name="priority" value={priority} label="Priority">
          <option value="all">All Priorities</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABEL[p]}
            </option>
          ))}
        </AutoSubmitSelect>
      </Form>

      <Table testId="tasks-table" minWidth={980}>
        <thead>
          <tr>
            <Th>Session</Th>
            <Th>Priority</Th>
            <Th>Assigned</Th>
            <Th>Created Date</Th>
            <Th>Status</Th>
            <Th>Action</Th>
          </tr>
        </thead>
        <tbody>
          {shown.map((t) => (
            <tr key={`${t.kind}-${t.id}`} data-task={t.kind === "task" ? t.id : undefined} data-session={t.sessionId ?? undefined} data-status={t.status}>
              <Td>
                <span className="flex flex-col">
                  <b className="text-[16px]">{t.title}</b>
                  <span className="text-[14px] text-muted">
                    {t.part} · {t.station}
                  </span>
                </span>
              </Td>
              <Td>
                {t.priority ? (
                  <Chip tone={PRIORITY_TONE[t.priority]} size="sm">
                    {PRIORITY_LABEL[t.priority]}
                  </Chip>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </Td>
              <Td>{t.assignedName}</Td>
              <Td>
                <LocalTime iso={t.createdAt} />
              </Td>
              <Td>
                <span className="inline-flex items-center gap-2 whitespace-nowrap" data-testid="task-status">
                  <span aria-hidden className={cx("size-2.5 rounded-full", DOT[t.status])} />
                  {TASK_STATUS_LABEL[t.status]}
                </span>
              </Td>
              <Td>
                {t.kind === "task" ? (
                  <OpenTask task={t} operatorName={user.name} sop={{ id: rev.id, label: rev.label }} />
                ) : t.status === "in_progress" ? (
                  <ButtonLink href={`/check/${t.id}`} className="min-h-[56px] px-4 text-[15px] shadow-none" aria-label={`Resume ${t.title}`}>
                    Resume
                  </ButtonLink>
                ) : (
                  <ButtonLink href={`/sessions/${t.id}`} className="min-h-[56px] px-4 text-[15px] shadow-none" aria-label={`View ${t.title}`}>
                    View
                  </ButtonLink>
                )}
              </Td>
            </tr>
          ))}
          {shown.length === 0 && active > 0 && (
            <tr>
              <Td colSpan={6} className="py-8 text-center text-[16px] text-muted">
                No sessions match these filters.
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
      </>
      )}

      {active === 0 && (
        <p className="rounded-[16px] border-2 border-dashed border-line px-6 py-6 text-center text-[16px] text-muted" data-testid="none-assigned">
          No checks assigned to you right now. Your supervisor&apos;s checks show up here, or start one above.
        </p>
      )}

        <h2 className="pt-2 text-[20px] font-semibold">Recent checks</h2>
        {home.recent.length === 0 ? (
          <p className="text-[15px] text-muted">No completed checks yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line" data-testid="recent-checks">
            {home.recent.map((r) => (
              <li key={r.id} className="grid grid-cols-[150px_1fr_auto_70px_60px] items-center gap-3 py-2.5 text-[15px]" data-session={r.id}>
                <b className="whitespace-nowrap">
                  <LocalTime iso={r.finishedAt} />
                </b>
                <span className="truncate">
                  {r.part} · {r.station.split(" · ")[0]}
                </span>
                <StatusChip status={r.status} />
                <span className="text-right tabular-nums">{r.cycleSeconds === null ? "—" : fmtClock(r.cycleSeconds * 1000)}</span>
                <b className={cx("text-right", confTone(r.conformance))}>{r.conformance === null ? "—" : `${r.conformance}%`}</b>
              </li>
            ))}
          </ul>
        )}
        <Link href="/sessions" className="w-fit font-semibold text-primary-ink underline">
          See all past sessions
        </Link>
      </section>

      <section className="flex min-w-0 flex-col gap-3 rounded-[22px] border border-line bg-surface px-6 py-5 shadow-card" data-testid="before-you-start">
        <h2 className="text-[20px] font-semibold">Before you start</h2>
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
        <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 px-6 py-6 md:px-8">
          <Suspense fallback={<p className="text-[17px] text-muted">Loading sessions…</p>}>
            <Body searchParams={props.searchParams} />
          </Suspense>
        </main>
      </TechShell>
    </Gate>
  );
}