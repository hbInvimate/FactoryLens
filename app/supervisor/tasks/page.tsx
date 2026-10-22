// /supervisor/tasks: every check and assigned session, with filters. Read-only: Watch opens the session's page.
import Form from "next/form";
import { connection } from "next/server";
import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import { ButtonLink, Card, Input, Table, Td, Th, cx } from "@/components/ds";
import { IconSearch } from "@/components/ds/icons";
import { LocalTime } from "@/components/LocalTime";
import { SupervisorPage } from "@/components/supervisor/SupervisorShell";
import { AutoSubmitSelect } from "@/components/tasks/AutoSubmit";
import { currentUser } from "@/lib/auth/server";
import { NotConfigured } from "@/lib/server/repo";
import { TASK_STATUSES, TASK_STATUS_LABEL, listOwnChecks, listTasks, technicians, type Task, type TaskStatus } from "@/lib/server/tasks";

export const metadata = { title: "FactoryLens AI: Tasks" };

const DOT: Record<TaskStatus, string> = { not_started: "bg-line-strong", in_progress: "bg-amber", completed: "bg-primary", closed: "bg-red" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

async function Body({ searchParams }: { searchParams: PageProps<"/supervisor/tasks">["searchParams"] }) {
  const sp = await searchParams;
  await connection();
  const user = await currentUser();
  if (!user) return null;
  const s = one(sp.status);
  const status = s === "all" || (TASK_STATUSES as readonly string[]).includes(s) ? s : "active";
  const who = one(sp.who) || "all";
  const q = one(sp.q).trim().slice(0, 120).toLowerCase();

  let rows: Task[];
  let people: { id: string; name: string }[];
  try {
    const [tasks, checks, techs] = await Promise.all([listTasks(user), listOwnChecks(user), technicians()]);
    rows = [...tasks, ...checks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    people = techs;
  } catch (e) {
    if (e instanceof NotConfigured) return <Card className="px-6 py-5 text-[17px]">{e.message}</Card>;
    throw e;
  }
  const shown = rows.filter(
    (t) =>
      (status === "all" || (status === "active" ? t.status === "not_started" || t.status === "in_progress" : t.status === status)) &&
      (who === "all" || t.assignedTo === who) &&
      (!q || [t.title, t.part, t.station, t.assignedName].some((x) => x.toLowerCase().includes(q))),
  );

  return (
    <>
      <Form action="/supervisor/tasks" className="flex flex-wrap items-center gap-3" role="search">
        <span className="relative w-full max-w-[460px] flex-1">
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">
            <IconSearch />
          </span>
          <Input name="q" type="search" defaultValue={one(sp.q)} key={one(sp.q)} placeholder="Search part, station or person" aria-label="Search" className="pl-11" />
        </span>
        <span className="flex-1" />
        <AutoSubmitSelect name="status" value={status} label="Status">
          <option value="active">Active (Not started, In progress)</option>
          <option value="all">All Status</option>
          {TASK_STATUSES.map((x) => (
            <option key={x} value={x}>
              {TASK_STATUS_LABEL[x]}
            </option>
          ))}
        </AutoSubmitSelect>
        <AutoSubmitSelect name="who" value={who} label="Quality Technician">
          <option value="all">Everyone</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </AutoSubmitSelect>
      </Form>

      <Table testId="supervisor-tasks" minWidth={880}>
        <thead>
          <tr>
            <Th>Check</Th>
            <Th>Quality Technician</Th>
            <Th>Created</Th>
            <Th>Status</Th>
            <Th>Action</Th>
          </tr>
        </thead>
        <tbody>
          {shown.map((t) => (
            <tr key={`${t.kind}-${t.id}`} data-session={t.sessionId ?? undefined} data-status={t.status}>
              <Td>
                <span className="flex flex-col">
                  <b className="text-[16px]">{t.title}</b>
                  <span className="text-[14px] text-muted">
                    {t.part} · {t.station}
                  </span>
                </span>
              </Td>
              <Td>{t.assignedName}</Td>
              <Td>
                <LocalTime iso={t.createdAt} />
              </Td>
              <Td>
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  <span aria-hidden className={cx("size-2.5 rounded-full", DOT[t.status])} />
                  {TASK_STATUS_LABEL[t.status]}
                </span>
              </Td>
              <Td>
                {t.sessionId ? (
                  <ButtonLink href={`/sessions/${t.sessionId}`} className="min-h-[56px] px-4 text-[15px] shadow-none" aria-label={`Watch ${t.title}`}>
                    Watch
                  </ButtonLink>
                ) : (
                  <span className="text-muted">Not started</span>
                )}
              </Td>
            </tr>
          ))}
          {shown.length === 0 && (
            <tr>
              <Td colSpan={5} className="py-8 text-center text-[16px] text-muted">
                {rows.length === 0 ? "No checks yet." : "No checks match these filters."}
              </Td>
            </tr>
          )}
        </tbody>
      </Table>
    </>
  );
}

export default function SupervisorTasksPage(props: PageProps<"/supervisor/tasks">) {
  return (
    <Gate area="supervisor" next="/supervisor/tasks">
      <SupervisorPage current="tasks" title="Tasks" sub="Every check, assigned or started on the floor. Read-only.">
        <Suspense fallback={<p className="text-[17px] text-muted">Loading checks…</p>}>
          <Body searchParams={props.searchParams} />
        </Suspense>
      </SupervisorPage>
    </Gate>
  );
}
