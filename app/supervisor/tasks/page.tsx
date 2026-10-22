// /supervisor/tasks: every check and assigned session, with filters. Read-only: Watch opens the session's page.
import Form from "next/form";
import { connection } from "next/server";
import Link from "next/link";
import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import { ButtonLink, Card, Input, Table, Td, Th, cx } from "@/components/ds";
import { IconSearch } from "@/components/ds/icons";
import { LocalTime } from "@/components/LocalTime";
import { SupervisorPage } from "@/components/supervisor/SupervisorShell";
import { AutoSubmitSelect } from "@/components/tasks/AutoSubmit";
import { currentUser } from "@/lib/auth/server";
import { NotConfigured } from "@/lib/server/repo";
import { DEVIATION_LABEL, isDeviationKind, sessionsMatching } from "@/lib/server/supervisor";
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
  // From Analytics: a station, a step over its target, or a deviation on a step.
  const station = one(sp.station).trim().slice(0, 80);
  const stepN = Number(one(sp.step));
  const step = Number.isInteger(stepN) && stepN >= 1 && stepN <= 12 ? stepN : null;
  const dev = isDeviationKind(one(sp.dev)) ? (one(sp.dev) as "skipped" | "wrong_order") : null;
  const focus = station ? `Station: ${station}` : step && dev ? `Step ${step} ${DEVIATION_LABEL[dev]}` : step ? `Step ${step} over its target time` : null;

  let rows: Task[];
  let people: { id: string; name: string }[];
  let matching: Set<string> | null = null;
  try {
    const [tasks, checks, techs, m] = await Promise.all([listTasks(user), listOwnChecks(user), technicians(), step ? sessionsMatching(step, dev) : null]);
    matching = m;
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
      (!station || t.station.trim() === station) &&
      (!matching || (t.sessionId !== null && matching.has(t.sessionId))) &&
      (!q || [t.title, t.part, t.station, t.assignedName].some((x) => x.toLowerCase().includes(q))),
  );

  return (
    <>
      <Form
        action="/supervisor/tasks"
        className="flex flex-wrap items-center gap-3 [&_select]:truncate [&_select[name=status]]:w-[200px] [&_select[name=who]]:w-[220px]"
        role="search"
      >
        <span className="relative w-full max-w-[380px] min-w-[280px] flex-1">
          <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted">
            <IconSearch />
          </span>
          <Input name="q" type="search" defaultValue={one(sp.q)} key={one(sp.q)} placeholder="Search part, station or person" aria-label="Search" className="pl-11" />
        </span>
        {/* The two dropdowns stay together: next to the search, or both under it on a narrow screen. */}
        <span className="flex gap-3">
          <AutoSubmitSelect name="status" value={status} label="Status">
            <option value="active" title="Not started and In progress">
              Active
            </option>
            <option value="all">All statuses</option>
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
          {station && <input type="hidden" name="station" value={station} />}
          {step && <input type="hidden" name="step" value={step} />}
          {dev && <input type="hidden" name="dev" value={dev} />}
        </span>
      </Form>

      {focus && (
        <p className="flex flex-wrap items-center gap-3 text-[16px]" data-testid="tasks-focus">
          <span className="rounded-full border border-primary-line bg-primary-soft px-4 py-2 font-semibold text-primary-ink">{focus}</span>
          <Link href={`/supervisor/tasks?status=${status}`} className="inline-flex min-h-[56px] items-center px-2 text-primary-ink underline">
            Clear
          </Link>
        </p>
      )}

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
