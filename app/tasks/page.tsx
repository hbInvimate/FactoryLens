// /tasks: the Quality Technician's home after sign-in. One task is one first-off check to do; its status
// follows the check started from it. Default view: active tasks (Not started and In progress).
import Form from "next/form";
import { connection } from "next/server";
import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import { ButtonLink, Card, Chip, Input, StatTile, Table, Td, Th, cx, type ChipTone } from "@/components/ds";
import { IconChecklist, IconClock, IconSearch, IconTarget } from "@/components/ds/icons";
import { LocalTime } from "@/components/LocalTime";
import { AutoSubmitSelect } from "@/components/tasks/AutoSubmit";
import { NewTask } from "@/components/tasks/NewTask";
import { OpenTask } from "@/components/tasks/OpenTask";
import { TechShell } from "@/components/tasks/TechShell";
import { seesAllSessions } from "@/lib/auth/roles";
import { currentUser } from "@/lib/auth/server";
import { NotConfigured } from "@/lib/server/repo";
import { activeRevision } from "@/lib/server/sop";
import { PRIORITIES, PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL, listOwnChecks, listTasks, technicians, type Priority, type Task, type TaskStatus } from "@/lib/server/tasks";
import Link from "next/link";

export const metadata = { title: "FactoryLens AI: Sessions" };

const PRIORITY_TONE: Record<Priority, ChipTone> = { high: "red", medium: "amber", low: "gray" };
const DOT: Record<TaskStatus, string> = { not_started: "bg-line-strong", in_progress: "bg-amber", completed: "bg-primary", closed: "bg-red" };

type StatusFilter = "active" | "all" | TaskStatus;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function matches(task: Task, status: StatusFilter, priority: string, q: string) {
  if (status === "active" ? !(task.status === "not_started" || task.status === "in_progress") : status !== "all" && task.status !== status) return false;
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
  const status: StatusFilter = statusParam === "all" || (TASK_STATUSES as readonly string[]).includes(statusParam) ? (statusParam as StatusFilter) : "active";
  const priority = (PRIORITIES as readonly string[]).includes(one(sp.priority)) ? one(sp.priority) : "all";
  const q = one(sp.q).trim().slice(0, 120);

  let tasks: Task[];
  let checks: Task[];
  let assignees: { id: string; name: string }[] | null;
  let rev;
  try {
    [tasks, checks, assignees, rev] = await Promise.all([listTasks(user), listOwnChecks(user), seesAllSessions(user.role) ? technicians() : Promise.resolve(null), activeRevision()]);
  } catch (e) {
    if (e instanceof NotConfigured) return <Card className="px-6 py-5 text-[17px]">{e.message}</Card>;
    throw e;
  }
  // Assigned tasks and the checks started on Start a check, in one list, newest first.
  tasks = [...tasks, ...checks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const shown = tasks.filter((t) => matches(t, status, priority, q));
  const count = (s: TaskStatus) => tasks.filter((t) => t.status === s).length;

  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-1 flex-col">
          <h1 className="text-[30px] font-bold">Sessions</h1>
          <p className="text-[16px] text-muted">View and manage all sessions</p>
        </div>
        <NewTask assignees={assignees} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile icon={<IconChecklist />} tone="blue" value={tasks.length} label="Total Session" testId="stat-total" />
        <StatTile icon={<IconClock />} tone="amber" value={count("not_started")} label="Not Started" testId="stat-not-started" />
        <StatTile icon={<IconTarget />} tone="green" value={count("completed")} label="Completed Sessions" testId="stat-completed" />
      </div>

      <Form action="/tasks" className="flex flex-wrap items-center gap-3" role="search">
        <span className="relative w-full max-w-[460px] flex-1">
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">
            <IconSearch />
          </span>
          <Input name="q" type="search" defaultValue={q} key={q} placeholder="Search session" aria-label="Search session" className="pl-11" />
        </span>
        <span className="flex-1" />
        <AutoSubmitSelect name="status" value={status} label="Status">
          <option value="active">Active (Not started, In progress)</option>
          <option value="all">All Status</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS_LABEL[s]}
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
            <Th>Type</Th>
            <Th>Status</Th>
            <Th>Submission</Th>
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
              <Td>First-off check</Td>
              <Td>
                <span className="inline-flex items-center gap-2 whitespace-nowrap" data-testid="task-status">
                  <span aria-hidden className={cx("size-2.5 rounded-full", DOT[t.status])} />
                  {TASK_STATUS_LABEL[t.status]}
                </span>
              </Td>
              <Td>
                {t.sessionId && (t.status === "completed" || t.status === "closed") ? (
                  <Link href={`/sessions/${t.sessionId}`} className="font-semibold text-primary-ink hover:underline">
                    Review
                  </Link>
                ) : (
                  <span className="text-muted">None yet</span>
                )}
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
          {shown.length === 0 && (
            <tr>
              <Td colSpan={8} className="py-8 text-center text-[16px] text-muted">
                {tasks.length === 0 ? "No sessions yet. Tap + New Session to add one." : "No sessions match these filters."}
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
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