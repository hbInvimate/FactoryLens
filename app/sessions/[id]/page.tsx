import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { LocalTime } from "@/components/LocalTime";
import { PageBar } from "@/components/PageBar";
import { StatusChip } from "@/components/StatusChip";
import { Chip, KV, Panel, Tick, Ring, Warn } from "@/components/ui";
import type { Projection } from "@/lib/check/project";
import { ENDED_STATUSES, STATUS_LABEL } from "@/lib/check/types";
import { missedPoints } from "@/lib/dashboard/missed";
import { getRepo, NotConfigured } from "@/lib/server/repo";
import { isSessionId } from "@/lib/server/validate";
import { STEPS, stepLabel } from "@/lib/sop";
import { NotConfiguredNotice, TableSkeleton } from "../shared";

export const metadata = { title: "FactoryLens AI: session" };

const KIND_TEXT: Record<string, string> = {
  done: "Done",
  wrong_order: "Wrong order",
  skipped: "Step skipped",
  fixed: "Fixed",
  cannot_do: "Cannot do",
};

function since(start: Date, at: Date): string {
  const s = Math.max(0, Math.round((at.getTime() - start.getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function stepOutcome(p: Projection, n: number): { text: string; tone: "green" | "amber" | "red" | "gray" } {
  const ev = p.stepEvents.filter((e) => e.step === n);
  if (ev.some((e) => e.kind === "fixed")) return { text: "Corrected", tone: "amber" };
  if (ev.some((e) => e.kind === "done")) return { text: "Correct", tone: "green" };
  if (ev.some((e) => e.kind === "cannot_do")) return { text: "Stopped here", tone: "red" };
  if (ev.length) return { text: "Deviation open", tone: "amber" };
  return { text: n < p.session.currentStep ? "Done" : "Not reached", tone: "gray" };
}

async function Detail({ params }: { params: PageProps<"/sessions/[id]">["params"] }) {
  const { id } = await params;
  await connection();
  if (!isSessionId(id)) notFound();
  let p: Projection | null;
  try {
    p = await getRepo().detail(id);
  } catch (e) {
    if (e instanceof NotConfigured) return <NotConfiguredNotice />;
    throw e;
  }
  if (!p) notFound();
  const s = p.session;
  const open = !ENDED_STATUSES.includes(s.status);
  const deviations = p.stepEvents.filter((e) => e.kind !== "done");
  const pointsByStep = (n: number) => p!.points.filter((x) => x.step === n);

  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <h1 className="text-[30px] font-semibold">
          {s.part} · {s.fixture}
        </h1>
        <StatusChip status={s.status} />
        <span className="flex-1" />
        {open && (
          <Link href={`/check/${s.id}`} className="tap inline-flex items-center rounded-xl border-2 border-blue bg-blue px-6 text-[20px] font-semibold text-blue-ink">
            Resume this check
          </Link>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-5">
          <Panel title="Session">
            <div>
              <KV k="Quality Technician" v={s.operatorLabel} />
              <KV k="SOP" v={s.sop} />
              <KV k="Started" v={<LocalTime iso={s.startedAt.toISOString()} />} />
              <KV k="Ended" v={s.endedAt ? <LocalTime iso={s.endedAt.toISOString()} /> : "—"} />
              <KV k="Steps done" v={`${s.stepsDone} of 12`} />
              <KV k="Check points" v={`${s.checkPoints} of 50`} />
              <KV
                k="Sequence conformance"
                v={
                  <span data-testid="detail-conformance">
                    {s.status === "complete" && s.conformance !== null
                      ? `${s.conformance}% (${s.correctFirstTime} of 12 correct first time)`
                      : s.status === "running" || s.status === "paused"
                        ? "In progress"
                        : `Not scored: ${STATUS_LABEL[s.status].toLowerCase()}`}
                  </span>
                }
              />
            </div>
          </Panel>

          <Panel title="Steps">
            <ol className="flex flex-col">
              {STEPS.map((st) => {
                const o = stepOutcome(p!, st.n);
                const pts = pointsByStep(st.n);
                return (
                  <li key={st.n} className="flex min-h-11 items-center gap-3 border-b border-line py-1 last:border-0">
                    {o.tone === "green" ? <Tick size={24} /> : o.tone === "amber" ? <Tick size={24} tone="amber" /> : o.tone === "red" ? <Warn size={24} /> : <Ring n={st.n} size={24} />}
                    <span className="flex flex-1 flex-col">
                      <span className="text-[18px]">{st.name}</span>
                      {st.points.length > 0 && (
                        <span className="text-sm text-muted">
                          {pts.length} of {st.points.length} confirmed{pts.length ? `: ${pts.map((x) => x.pointId).join(", ")}` : ""}
                        </span>
                      )}
                    </span>
                    <Chip small tone={o.tone}>{o.text}</Chip>
                  </li>
                );
              })}
            </ol>
          </Panel>
        </div>

        <div className="flex flex-col gap-5">
          <Panel title={`Deviations and step events (${deviations.length})`}>
            {deviations.length === 0 && <p className="text-[18px] text-soft">None. Every step was correct first time.</p>}
            <ol className="flex flex-col">
              {deviations.map((e) => (
                <li key={e.id} className="flex items-start gap-3 border-b border-line py-2 last:border-0">
                  <span className="w-14 flex-none pt-0.5 font-mono text-[15px] text-muted">{since(s.startedAt, e.at)}</span>
                  <span className="flex flex-1 flex-col">
                    <span className="text-[18px]">
                      Step {e.step}: {KIND_TEXT[e.kind] ?? e.kind}
                      {e.detail ? `, ${e.detail.charAt(0).toLowerCase()}${e.detail.slice(1)}` : ""}
                    </span>
                    {e.kind === "skipped" && (
                      <span className="text-[15px] text-soft" data-testid="missed-points">
                        Missed points: {missedPoints(e, p!.points)?.join(", ") ?? "not recorded"}
                      </span>
                    )}
                    <span className="text-sm text-muted">
                      Attempt {e.attempt} · <LocalTime iso={e.at.toISOString()} timeOnly />
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel title={`Lodged discrepancies (${p.discrepancies.length})`}>
            {p.discrepancies.length === 0 && <p className="text-[18px] text-soft">None lodged.</p>}
            {p.discrepancies.map((d) => {
              const h = p!.handoffs.find((x) => x.discrepancyId === d.id);
              return (
                <div key={d.id} className="flex flex-col gap-1 rounded-xl bg-panel2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="flex-1 text-[19px] font-semibold">{d.issueLabel}</span>
                    <Chip small tone={d.effect === "stop" ? "red" : "amber"}>{d.effect === "stop" ? "Check stops" : "Check continues"}</Chip>
                    <Chip small tone={d.status === "open" || d.status === "escalated" ? "amber" : "green"}>{d.status.replace("_", " ")}</Chip>
                  </div>
                  <span className="text-[15px] text-muted">
                    {stepLabel(d.step)} · logged at {since(s.startedAt, d.loggedAt)} · {d.kind} · calls: {d.whoToCall.join(", ") || "none"}
                  </span>
                  {d.whatWasDone && <p className="whitespace-pre-line text-[15px] text-soft">{d.whatWasDone}</p>}
                  {h && (
                    <p className="text-[15px] text-soft">
                      Handoff: marks {h.marks ? "done" : "not done"}, {h.photos} photos, sheet {h.sheet ? "done" : "not done"},{" "}
                      {h.handedOverAt ? `handed over, waited ${Math.floor(h.waitingSeconds / 60)} min ${h.waitingSeconds % 60} s` : "not handed over"}
                      {h.outcome ? `. Outcome: ${h.outcome}` : ""}
                    </p>
                  )}
                  {d.clearedBy && (
                    <p className="text-[15px] text-soft">
                      Closed by {d.clearedBy}: {d.clearReason}
                    </p>
                  )}
                </div>
              );
            })}
          </Panel>
        </div>
      </div>
    </>
  );
}

export default function SessionPage(props: PageProps<"/sessions/[id]">) {
  return (
    <>
      <PageBar title="Session" />
      <main className="flex flex-1 flex-col gap-5 px-8 py-7">
        <Link href="/sessions" className="tap inline-flex w-fit items-center text-[18px] text-blue-text">
          ← All sessions
        </Link>
        <Suspense fallback={<TableSkeleton />}>
          <Detail params={props.params} />
        </Suspense>
      </main>
    </>
  );
}
