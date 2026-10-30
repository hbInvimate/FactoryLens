// /tasks: the Quality Technician's home after sign-in. One task is one first-off check to do; its status
// follows the check started from it. Only work still to do: Not started, In progress and Paused. Finished checks
// (Completed, Closed, Left) are in Past sessions.
import Form from "next/form";
import { connection } from "next/server";
import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import { ButtonLink, Card, Chip, Input, StatTile, Table, Td, Th, cx, type ChipTone } from "@/components/ds";
import { IconClock, IconPlay, IconSearch } from "@/components/ds/icons";
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
  try {
    [tasks, checks, rev, banner] = await Promise.all([listTasks(user), listOwnChecks(user), activeRevision(), bannerFor(user.id)]);
  } catch (e) {
    if (e instanceof NotConfigured) return <Card className="px-6 py-5 text-[17px]">{e.message}</Card>;
    throw e;
  }
  // Assigned tasks and checks started without a task (older ones), in one list, newest first.
  tasks = [...tasks, ...checks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const shown = tasks.filter((t) => matches(t, status, priority, q));
  const notStarted = tasks.filter((t) => t.status === "not_started").length;
  const inProgress = tasks.filter((t) => t.status === "in_progress" && !isPaused(t)).length;
  const active = tasks.filter(isActive).length;

  return (
    <>
      {/* A new Active SOP revision, once per Quality Technician. */}
      {banner && <SopBanner {...banner} />}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-1 flex-col">
          <h1 className="text-[30px] font-bold">Sessions</h1>
          <p className="text-[16px] text-muted">Checks assigned to you</p>
        </div>
        <ButtonLink variant="primary" href="/" data-testid="start-a-check">
          Start a check
        </ButtonLink>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile icon={<IconClock />} tone="amber" value={notStarted} label="Not started" testId="stat-not-started" />
        <StatTile icon={<IconPlay />} tone="blue" value={inProgress} label="In progress" testId="stat-in-progress" />
      </div>

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

      {active === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-[20px] border-2 border-dashed border-line-strong px-6 py-10 text-center" data-testid="none-assigned">
          <p className="text-[19px] text-ink-2">No checks assigned to you</p>
          <ButtonLink variant="primary" href="/" className="min-h-[64px] px-8 text-[20px]" data-testid="start-a-check-empty">
            Start a check
          </ButtonLink>
        </div>
      )}
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