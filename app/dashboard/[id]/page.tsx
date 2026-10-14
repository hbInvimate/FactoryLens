import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Card, LChip, Note, Page, Skeleton, StatCard } from "@/components/dashboard/light";
import { ClipToggle, PrintButton, PrintedOn } from "@/components/dashboard/ReportParts";
import { LiveWait } from "@/components/dashboard/SessionsTable";
import { LocalTime } from "@/components/LocalTime";
import { PageBar } from "@/components/PageBar";
import { stationOf } from "@/lib/check/project";
import {
  activeAt, activeCheckMs, conformance, correctFirstTime, openHoldsAll, reduce,
} from "@/lib/check/reducer";
import { HOLD_OUTCOMES, STATUS_LABEL, type CheckState, type Deviation, type Discrepancy } from "@/lib/check/types";
import { deviationCards, discrepancyCards, TYPE_LABEL } from "@/lib/dashboard/report";
import { fmtClock } from "@/lib/format";
import { getRepo, NotConfigured } from "@/lib/server/repo";
import { isSessionId } from "@/lib/server/validate";
import { STEPS } from "@/lib/sop";

export const metadata = { title: "FactoryLens AI: session report" };

type Outcome = { tone: "green" | "red" | "gray" | "blue" | "amber"; title: string; detail: string };

/** The dashboard filters the user came from, so "Back to the dashboard" returns to the same view. */
const KEEP = ["station", "range", "shift", "sample", "dev"] as const;

function backHref(sp: Record<string, string | string[] | undefined>): string {
  const q = new URLSearchParams();
  for (const k of KEEP) {
    const v = sp[k];
    if (typeof v === "string" && v) q.set(k, v);
  }
  const s = q.toString();
  return s ? `/dashboard?${s}` : "/dashboard";
}

function decisionText(d: Discrepancy): string {
  if (d.decision) return `${HOLD_OUTCOMES.find((o) => o.id === d.decision!.outcome)?.label}, decided by ${d.decision.by}: ${d.decision.reason}`;
  if (d.status === "released") return "Released after a trial part passed (hole check procedure)";
  if (d.status === "cleared" || d.status === "scrapped") {
    return `${d.status === "scrapped" ? "Part scrapped" : "Cleared"}, by ${d.clearedBy ?? "not recorded"}: ${d.clearReason ?? "not recorded"} (recorded before hold decisions)`;
  }
  return "No decision recorded yet";
}

function outcomeOf(s: CheckState): Outcome {
  const right = correctFirstTime(s);
  const closing = s.final ? s.discrepancies.find((d) => d.id === s.final!.did) : undefined;
  switch (s.status) {
    case "complete":
      return { tone: "green", title: "Complete", detail: `${right} of 12 steps correct first time.` };
    case "scrapped":
    case "rework":
    case "concession":
      return { tone: "red", title: `${STATUS_LABEL[s.status]}, not scored`, detail: closing ? `${closing.issue}. ${decisionText(closing)}.` : "" };
    case "part_held": {
      const d = s.discrepancies.find((x) => x.effect === "stop" && x.status !== "fixed_on_spot" && x.status !== "open");
      return { tone: "red", title: "Part held and not scored", detail: d ? `${d.issue}. ${decisionText(d)}.` : "" };
    }
    case "left":
      return closing
        ? { tone: "gray", title: "Left: check abandoned", detail: `${closing.issue}. ${decisionText(closing)}. Not scored.` }
        : { tone: "gray", title: "Left", detail: `Reason: ${s.left?.reason ?? "not recorded"}. Not scored.` };
    case "on_hold":
    case "stopped": {
      const h = openHoldsAll(s)[0];
      return {
        tone: "amber",
        title: "On hold",
        detail: `${h ? `${h.issue}. The check ${h.effect === "stop" ? "is stopped" : "continues"}. ` : ""}Not scored while on hold.`,
      };
    }
    default:
      return { tone: "blue", title: "Running", detail: `${s.status === "paused" ? "Paused" : "In progress"}. At step ${Math.min(s.current, 12)} of 12. Not scored yet.` };
  }
}

const BANNER = {
  green: "border-[#9fd9b6] bg-[#e9f7ef] text-[#17673a]",
  red: "border-[#efb1ab] bg-[#fdeceb] text-[#9b2c22]",
  gray: "border-[#cfd5dc] bg-[#f1f3f5] text-[#3b424a]",
  blue: "border-[#b3cdf3] bg-[#eaf2fd] text-[#1d4f9f]",
  amber: "border-[#f1d58a] bg-[#fff8e3] text-[#7a5600]",
};

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-3 border-t border-[#eceff3] py-2 text-[15px] first:border-t-0">
      <span className="w-40 flex-none text-[#6b7480]">{k}</span>
      <span className="min-w-0 flex-1">{v}</span>
    </div>
  );
}

const At = ({ s, at }: { s: CheckState; at: number }) => (
  <>
    {fmtClock(activeAt(s, at))} <span className="text-[#6b7480]">(<LocalTime iso={new Date(at).toISOString()} timeOnly />)</span>
  </>
);

/** Why it was on hold, who was called, how long it waited, and what was decided. Only when there was a hold. */
function HoldSection({ s }: { s: CheckState }) {
  const holds = s.discrepancies.filter((d) => d.status !== "fixed_on_spot");
  if (!holds.length) return null;
  return (
    <section className="flex flex-col gap-3" data-testid="hold-section">
      <h2 className="print-keep-heading pt-2 text-[20px] font-semibold">Hold</h2>
      {holds.map((d) => {
        const open = d.status === "open" || d.status === "escalated";
        return (
          <Card key={d.id} className="px-5 py-3" accent={open ? "amber" : "gray"}>
            <h3 className="pb-1 text-[17px] font-semibold">
              Step {d.step || "—"}: {d.issue}
            </h3>
            <Row k="Why" v={`${d.issue} · ${d.category} · the check ${d.effect === "stop" ? "stopped" : "continued"}`} />
            <Row k="Who was called" v={`${d.who.length ? d.who.join(", ") : "No call needed"}${d.called.length ? ` (marked called: ${d.called.join(", ")})` : ""}`} />
            <Row k="Started at" v={<At s={s} at={d.loggedAt} />} />
            <Row
              k="Waiting time"
              v={open ? <LiveWait since={new Date(d.loggedAt).toISOString()} /> : d.closedAt ? fmtClock(d.closedAt - d.loggedAt) : "not recorded"}
            />
            <Row
              k="Decision"
              v={
                <span data-testid="hold-decision">
                  {d.decision ? (
                    <>
                      {HOLD_OUTCOMES.find((o) => o.id === d.decision!.outcome)?.label}, decided by {d.decision.by} at{" "}
                      <LocalTime iso={new Date(d.decision.decidedAt).toISOString()} timeOnly />. Reason: {d.decision.reason}
                    </>
                  ) : (
                    decisionText(d)
                  )}
                </span>
              }
            />
          </Card>
        );
      })}
    </section>
  );
}

function firstAttempt(s: CheckState, n: number, dev: Deviation | undefined): { tone: "green" | "red" | "amber" | "gray"; text: string } {
  if (dev) return dev.kind === "wrong_order" ? { tone: "red", text: "Incorrect" } : { tone: "amber", text: "Skipped" };
  if (s.steps[n - 1].doneAt !== null) return { tone: "green", text: "Correct" };
  if (s.stepEvents.some((e) => e.step === n && e.kind === "cannot_do")) return { tone: "red", text: "Stopped" };
  return { tone: "gray", text: "Not reached" };
}

function outcomeText(s: CheckState, n: number, dev: Deviation | undefined): string {
  const run = s.steps[n - 1];
  if (dev && dev.fixedAt !== null) return `Corrected after ${dev.failed} ${dev.failed === 1 ? "correction" : "corrections"}`;
  if (dev) return "Not corrected";
  if (run.doneAt !== null) return "Passed";
  return "Not done";
}

const TYPE_TONE = { skipped: "amber", wrong_order: "red", cannot_do: "red" } as const;

function WhatWentWrong({ cards }: { cards: ReturnType<typeof deviationCards> }) {
  return (
    <section className="flex flex-col gap-3" data-testid="what-went-wrong">
      <h2 className="print-keep-heading pt-2 text-[20px] font-semibold">What went wrong</h2>
      {cards.length === 0 && <Card className="px-5 py-4 text-[15px] text-[#4b5563]">No deviations. Every step was done correctly on the first attempt.</Card>}
      {cards.map((c) => (
        <Card key={c.key} className="flex flex-col gap-1 px-5 py-4" testId="deviation-card">
          <h3 className="flex flex-wrap items-center gap-2 text-[17px] font-semibold">
            Step {c.step}: {c.stepName} — {TYPE_LABEL[c.type]} at {fmtClock(c.sessionMs)}
            <LChip tone={TYPE_TONE[c.type]}>{TYPE_LABEL[c.type]}</LChip>
          </h3>
          <p className="text-[15px]">
            <b className="text-[#4b5563]">What happened:</b> <span data-testid="happened">{c.happened}</span>
            {c.points === null && c.type !== "cannot_do" && <span className="text-[#6b7480]"> (points not recorded)</span>}
          </p>
          <p className="text-[15px]">
            <b className="text-[#4b5563]">Expected:</b> {c.expected}
          </p>
          <p className="text-[14px] text-[#4b5563]">
            Time {fmtClock(c.sessionMs)} (<LocalTime iso={new Date(c.at).toISOString()} timeOnly />)
            {c.attempts !== null && <> · Attempt {c.attempts}</>}
            {c.corrected !== null && (
              <span data-testid="corrected">
                {" "}
                · {c.corrected ? `Corrected${c.attempts === 1 ? " on the first retry" : ` after ${c.attempts} failed attempts`}` : "Not corrected"}
              </span>
            )}
            {c.trainerCalled && <> · Trainer called</>}
          </p>
          {c.clip && <ClipToggle clip={c.clip} />}
        </Card>
      ))}
    </section>
  );
}

function DiscrepanciesLodged({ s }: { s: CheckState }) {
  const cards = discrepancyCards(s);
  return (
    <section className="flex flex-col gap-3" data-testid="discrepancies-lodged">
      <h2 className="print-keep-heading pt-2 text-[20px] font-semibold">Discrepancies lodged</h2>
      {cards.length === 0 && <Card className="px-5 py-4 text-[15px] text-[#4b5563]">No discrepancies lodged.</Card>}
      {cards.map((c) => (
        <Card key={c.key} className="flex flex-col gap-1 px-5 py-4" testId="discrepancy-card">
          <h3 className="flex flex-wrap items-center gap-2 text-[17px] font-semibold">
            {c.step ? `Step ${c.step}: ${c.stepName}` : c.stepName} — {c.issue}
            <LChip tone="blue">{c.category}</LChip>
          </h3>
          <p className="text-[15px] text-[#2b3138]">
            <b className="text-[#4b5563]">{c.fixedOnSpot ? "Fixed by the Quality Technician" : "Lodged"}</b> at {fmtClock(c.sessionMs)} (
            <LocalTime iso={new Date(c.loggedAt).toISOString()} timeOnly />).{" "}
            {!c.fixedOnSpot && (
              <>
                Calls: {c.who.length ? c.who.join(", ") : "none"}
                {c.called.length ? ` (marked called: ${c.called.join(", ")})` : ""}. {c.stopped ? "The check stopped." : "The check could continue."}
              </>
            )}
            {c.fixedOnSpot && "The check carried on."}
          </p>
          <p className="text-[15px]">
            <b className="text-[#4b5563]">Outcome:</b> <span data-testid="discrepancy-outcome">{c.outcome}</span>
          </p>
        </Card>
      ))}
    </section>
  );
}

async function Report({ id }: { id: string }) {
  await connection();
  if (!isSessionId(id)) notFound();
  let journal;
  let detail;
  try {
    const repo = getRepo();
    [journal, detail] = await Promise.all([repo.journal(id), repo.detail(id)]);
  } catch (e) {
    if (e instanceof NotConfigured) {
      return (
        <Card className="px-5 py-4">
          <h2 className="text-[18px] font-semibold">The database is not set up</h2>
          <p className="text-[15px] text-[#4b5563]">See the README: Set up the database.</p>
        </Card>
      );
    }
    throw e;
  }
  if (!journal || !detail) notFound();
  const { meta, actions } = journal;
  const s = reduce(actions, meta.createdAt);
  const conf = conformance(s);
  const live = s.status === "running" || s.status === "paused";
  const outcome = outcomeOf(s);
  const end = s.current > 12 ? s.steps[11].doneAt : s.endedAt;
  const lengthMs = s.current > 12 ? activeCheckMs(s) : end !== null ? activeAt(s, end) : null;
  const sample = detail.session.isSample === true;
  const cards = deviationCards(s, detail.stepEvents, detail.points);

  return (
    <>
      {sample && (
        <p data-testid="sample-mark" className="print-card w-fit rounded-full border-2 border-[#d79a12] bg-[#fdeec8] px-4 py-1 text-[14px] font-bold tracking-wide text-[#6b4e00]">
          SAMPLE DATA: this is a fake session for showing the dashboard
        </p>
      )}
      <div className="flex flex-col gap-1">
        <p className="hidden text-[13px] text-[#4b5563] print:block">FactoryLens AI · Session report</p>
        <h1 className="text-[28px] font-semibold">Post-session review</h1>
        <p className="flex flex-wrap gap-x-6 gap-y-1 text-[15px] text-[#4b5563]">
          <span>
            Quality Technician <b className="text-[#1b1f24]">{meta.operator}</b>
          </span>
          <span>
            Station <b className="text-[#1b1f24]">{stationOf(meta)}</b>
          </span>
          <span>
            SOP <b className="text-[#1b1f24]">{meta.sop}</b>
          </span>
          <span>
            Part <b className="text-[#1b1f24]">{meta.part}</b>
          </span>
          <span>
            Session date{" "}
            <b className="text-[#1b1f24]">
              <LocalTime iso={new Date(meta.createdAt).toISOString()} />
            </b>
          </span>
          <span className="hidden print:inline">
            <PrintedOn />
          </span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
        <StatCard
          testId="report-conformance"
          value={conf !== null ? `${conf}%` : live ? "In progress" : "Not scored"}
          label="Sequence conformance"
          accent={conf === null ? "gray" : conf === 100 ? "green" : "amber"}
        />
        <StatCard testId="report-correct" value={`${correctFirstTime(s)} of 12`} label="Steps correct first time" />
        <StatCard testId="report-deviations" value={s.deviations.length} label="Deviations" />
        <StatCard
          testId="report-length"
          value={lengthMs === null ? "not recorded" : fmtClock(lengthMs)}
          label="Session length"
          sub={lengthMs === null ? "in progress" : "without paused time"}
        />
      </div>

      <div role="status" data-testid="report-outcome" className={`print-card rounded-xl border px-5 py-3 ${BANNER[outcome.tone]}`}>
        <span className="text-[19px] font-semibold">{outcome.title}</span>
        {outcome.detail && <span className="text-[16px]"> · {outcome.detail}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-3 print:hidden" data-testid="report-actions">
        <PrintButton />
        <button type="button" disabled className="min-h-[56px] cursor-not-allowed rounded-lg border border-[#cfd5dc] bg-[#f4f5f7] px-5 text-[16px] font-semibold text-[#8a929c]">
          Send to quality system
        </button>
        <button type="button" disabled className="min-h-[56px] cursor-not-allowed rounded-lg border border-[#cfd5dc] bg-[#f4f5f7] px-5 text-[16px] font-semibold text-[#8a929c]">
          Replay this session
        </button>
        <span className="text-[14px] text-[#6b7480]">Coming later</span>
        <span className="flex-1" />
        <Link
          href={`/check/${id}`}
          className="inline-flex min-h-[56px] items-center rounded-lg border border-[#1f5fcf] px-5 text-[16px] font-semibold text-[#1f5fcf] hover:bg-[#eaf2fd]"
        >
          Open in the check app
        </Link>
      </div>

      <h2 className="print-keep-heading pt-2 text-[20px] font-semibold">Every step, in order</h2>
      <div className="overflow-x-auto rounded-xl border border-[#dfe3e8] bg-white print:overflow-visible">
        <table className="w-full min-w-[640px] text-left text-[15px]" data-testid="steps-table">
          <thead className="bg-[#f6f7f9] text-[14px]">
            <tr>
              <th className="w-12 px-4 py-3 font-semibold">#</th>
              <th className="px-3 py-3 font-semibold">Step</th>
              <th className="px-3 py-3 font-semibold">First attempt</th>
              <th className="px-3 py-3 font-semibold">Outcome</th>
              <th className="px-4 py-3 font-semibold">Done at</th>
            </tr>
          </thead>
          <tbody>
            {STEPS.map((st) => {
              const dev = s.deviations.find((d) => d.step === st.n);
              const fa = firstAttempt(s, st.n, dev);
              const done = s.steps[st.n - 1].doneAt;
              return (
                <tr key={st.n} className="border-t border-[#eceff3]" data-step={st.n}>
                  <td className="px-4 py-3">{st.n}</td>
                  <td className="px-3">{st.name}</td>
                  <td className="px-3">
                    <LChip tone={fa.tone}>{fa.text}</LChip>
                  </td>
                  <td className="px-3">{outcomeText(s, st.n, dev)}</td>
                  <td className="px-4">{done === null ? "—" : fmtClock(activeAt(s, done))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <WhatWentWrong cards={cards} />
      <DiscrepanciesLodged s={s} />
      <HoldSection s={s} />

      <p className="text-[13px] text-[#6b7480]" data-testid="footnote">
        Sequence conformance = steps done correctly on the first attempt divided by 12. It measures the procedure, not the part. Readings and tolerances stay in the tablet quality data tool.
      </p>
    </>
  );
}

/** Reads the session id and the filters the user came from. */
async function ReportPageBody(props: PageProps<"/dashboard/[id]">) {
  const [{ id }, sp] = await Promise.all([props.params, props.searchParams]);
  return (
    <>
      <Link
        href={backHref(sp)}
        className="inline-flex min-h-[56px] w-fit items-center text-[16px] font-medium text-[#1f5fcf] hover:underline print:hidden"
        data-testid="back-to-dashboard"
      >
        ← Back to the dashboard
      </Link>
      <Note />
      <Suspense fallback={<Skeleton rows={12} />}>
        <Report id={id} />
      </Suspense>
    </>
  );
}

export default function ReportPage(props: PageProps<"/dashboard/[id]">) {
  return (
    <>
      <PageBar current="dashboard" />
      <Page>
        <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-6 py-6 md:px-8 print:block print:max-w-none print:px-0 print:py-0 print:[&>*]:mb-4">
          <Suspense fallback={<Skeleton rows={12} />}>
            <ReportPageBody {...props} />
          </Suspense>
        </main>
      </Page>
    </>
  );
}
