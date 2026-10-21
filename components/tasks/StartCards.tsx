// The start page's two cards under "Start a first-off check": Up next (my sessions to do) and My last 3 checks.
// Read only; opening goes through the same buttons as the Sessions page.
import Link from "next/link";
import { Card, Chip, cx, type ChipTone } from "@/components/ds";
import { LocalTime } from "@/components/LocalTime";
import type { CurrentUser } from "@/lib/auth/server";
import type { SessionStatus } from "@/lib/check/types";
import { getRepo } from "@/lib/server/repo";
import { PRIORITY_LABEL, TASK_STATUS_LABEL, listTasks, taskStatus, type Priority, type TaskStatus } from "@/lib/server/tasks";
import { OpenTask } from "./OpenTask";

const PRIORITY_TONE: Record<Priority, ChipTone> = { high: "red", medium: "amber", low: "gray" };
const DOT: Record<TaskStatus, string> = { not_started: "bg-line-strong", in_progress: "bg-amber", completed: "bg-primary", closed: "bg-red" };

function StatusText({ status }: { status: TaskStatus }) {
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-[15px] text-ink-2">
      <span aria-hidden className={cx("size-2.5 rounded-full", DOT[status])} />
      {TASK_STATUS_LABEL[status]}
    </span>
  );
}

function Shell({ title, more, testId, children }: { title: string; more: { href: string; label: string }; testId: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-3 px-5 py-4" testId={testId}>
      <div className="flex items-center gap-3">
        <h2 className="flex-1 text-[20px] font-semibold">{title}</h2>
        <Link href={more.href} className="tap inline-flex items-center px-2 text-[15px] font-semibold text-primary-ink hover:underline">
          {more.label}
        </Link>
      </div>
      {children}
    </Card>
  );
}

/** The 3 newest sessions assigned to me that are Not started or In progress. */
export async function UpNext({ user, sop }: { user: CurrentUser; sop: { id: string | null; label: string } }) {
  const tasks = await listTasks({ id: user.id, role: "technician" }).catch(() => null);
  if (!tasks) return null;
  const next = tasks.filter((t) => t.status === "not_started" || t.status === "in_progress").slice(0, 3);
  return (
    <Shell title="Up next" more={{ href: "/tasks", label: "All sessions" }} testId="up-next">
      {next.length === 0 ? (
        <p className="text-[16px] text-muted">Nothing assigned to you right now.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {next.map((t) => (
            <li key={t.id} data-task={t.id} className="flex items-center gap-3 py-2.5">
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="truncate text-[16px]">{t.title}</b>
                <span className="truncate text-[14px] text-muted">
                  {t.part} · {t.station}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-2">
                  {t.priority && (
                    <Chip tone={PRIORITY_TONE[t.priority]} size="sm">
                      {PRIORITY_LABEL[t.priority]}
                    </Chip>
                  )}
                  <StatusText status={t.status} />
                </span>
              </span>
              <OpenTask task={t} operatorName={user.name} sop={sop} />
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

/** My 3 most recent checks, assigned or not. */
export async function LastChecks({ user }: { user: CurrentUser }) {
  const rows = await getRepo()
    .list(3, { userId: user.id })
    .catch(() => null);
  if (!rows) return null;
  return (
    <Shell title="My last 3 checks" more={{ href: "/sessions", label: "Past sessions" }} testId="last-checks">
      {rows.length === 0 ? (
        <p className="text-[16px] text-muted">No checks yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((s) => (
            <li key={s.id} data-session={s.id} className="flex items-center gap-3 py-2.5">
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="truncate text-[16px]">{s.part}</b>
                <span className="truncate text-[14px] text-muted">
                  {s.station ?? s.fixture} · <LocalTime iso={s.startedAt.toISOString()} />
                </span>
                <span className="mt-1">
                  <StatusText status={taskStatus(s.id, s.status as SessionStatus)} />
                </span>
              </span>
              <Link
                href={`/sessions/${s.id}`}
                aria-label={`View ${s.part}`}
                className="tap inline-flex items-center rounded-[var(--fl-radius-md)] border border-line-strong bg-surface px-4 text-[15px] font-semibold text-ink hover:bg-surface-2"
              >
                View
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}