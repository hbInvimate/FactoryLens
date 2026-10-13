import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Card, LChip, Note, Page, Skeleton, StatCard } from "@/components/dashboard/light";
import { PageBar } from "@/components/PageBar";
import { stationOf } from "@/lib/check/project";
import {
  activeAt, activeCheckMs, activeStop, conformance, correctFirstTime, reduce,
} from "@/lib/check/reducer";
import type { CheckState, Deviation } from "@/lib/check/types";
import { fmtClock } from "@/lib/format";
import { getRepo, NotConfigured } from "@/lib/server/repo";
import { isSessionId } from "@/lib/server/validate";
import { STEPS } from "@/lib/sop";

export const metadata = { title: "FactoryLens AI: session report" };

type Outcome = { tone: "green" | "red" | "gray" | "blue"; title: string; detail: string };

function outcomeOf(s: CheckState): Outcome {
  const right = correctFirstTime(s);
  if (s.status === "part_held") {
    const d = s.discrepancies.find((x) => x.effect === "stop" && x.status !== "fixed_on_spot" && x.status !== "open");
    const decided = d ? `${d.status === "scrapped" ? "Scrapped" : "Cleared"} by ${d.clearedBy ?? "not recorded"}: ${d.clearReason ?? "not recorded"}.` : "";
    return { tone: "red", title: "Part held and not scored", detail: `${d ? `${d.issue}. ` : ""}${decided}` };
  }
  if (s.status === "left") return { tone: "gray", title: "Left, not finished", detail: `Reason: ${s.left?.reason ?? "not recorded"}. Not scored.` };
  if (s.current > 12) return { tone: "green", title: "Complete", detail: `${right} of 12 steps correct first time.${s.status === "on_hold" ? " The cell is still on hold." : ""}` };
  const stop = activeStop(s);
  const state = s.status === "paused" ? "Paused" : s.status === "on_hold" ? "On hold, the check continues" : stop ? `Stopped, waiting: ${stop.issue}` : "In progress";
  return { tone: "blue", title: "Running", detail: `${state}. At step ${s.current} of 12. Not scored yet.` };
}

const BANNER = {
  green: "border-[#9fd9b6] bg-[#e9f7ef] text-[#17673a]",
  red: "border-[#efb1ab] bg-[#fdeceb] text-[#9b2c22]",
  gray: "border-[#cfd5dc] bg-[#f1f3f5] text-[#3b424a]",
  blue: "border-[#b3cdf3] bg-[#eaf2fd] text-[#1d4f9f]",
};

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

async function Report({ params }: { params: PageProps<"/dashboard/[id]">["params"] }) {
  const { id } = await params;
  await connection();
  if (!isSessionId(id)) notFound();
  let journal;
  try {
    journal = await getRepo().journal(id);
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
  if (!journal) notFound();
  const { meta, actions } = journal;
  const s = reduce(actions, meta.createdAt);
  const conf = conformance(s);
  const scoredOut = s.status === "part_held" || s.status === "left";
  const outcome = outcomeOf(s);
  const end = s.current > 12 ? s.steps[11].doneAt : s.endedAt;
  const lengthMs = s.current > 12 ? activeCheckMs(s) : end !== null ? activeAt(s, end) : null;

  return (
    <>
      <div className="flex flex-col gap-1">
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
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          testId="report-conformance"
          value={scoredOut ? "Not scored" : conf === null ? "Not finished" : `${conf}%`}
          label="Sequence conformance"
          accent={conf === null ? "gray" : conf === 100 ? "green" : "amber"}
        />
        <StatCard testId="report-correct" value={`${correctFirstTime(s)} of 12`} label="Steps correct first time" />
        <StatCard testId="report-deviations" value={s.deviations.length} label="Deviations" />
        <StatCard
          testId="report-length"
          value={lengthMs === null ? "not recorded" : fmtClock(lengthMs)}
          label="Session length"
          sub={lengthMs === null ? "not finished yet" : "without paused time"}
        />
      </div>

      <div role="status" data-testid="report-outcome" className={`rounded-xl border px-5 py-3 ${BANNER[outcome.tone]}`}>
        <span className="text-[19px] font-semibold">{outcome.title}</span>
        {outcome.detail && <span className="text-[16px]"> · {outcome.detail}</span>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled className="min-h-[56px] cursor-not-allowed rounded-lg border border-[#cfd5dc] bg-[#f4f5f7] px-5 text-[16px] font-semibold text-[#8a929c]">
          Send to quality system
        </button>
        <button type="button" disabled className="min-h-[56px] cursor-not-allowed rounded-lg border border-[#cfd5dc] bg-[#f4f5f7] px-5 text-[16px] font-semibold text-[#8a929c]">
          Replay this session
        </button>
        <span className="text-[14px] text-[#6b7480]">Coming later</span>
      </div>

      <h2 className="pt-2 text-[20px] font-semibold">Every step, in order</h2>
      <div className="overflow-x-auto rounded-xl border border-[#dfe3e8] bg-white">
        <table className="w-full min-w-[760px] text-left text-[15px]" data-testid="steps-table">
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
      <p className="text-[13px] text-[#6b7480]">
        Sequence conformance = steps done correctly on the first attempt divided by 12. It measures the procedure, not the part. Readings and tolerances stay in the tablet quality data tool.
      </p>
    </>
  );
}

export default function ReportPage(props: PageProps<"/dashboard/[id]">) {
  return (
    <>
      <PageBar current="dashboard" />
      <Page>
        <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-6 py-6 md:px-8">
          <Link href="/dashboard" className="inline-flex min-h-[56px] w-fit items-center text-[16px] font-medium text-[#1f5fcf] hover:underline">
            ← Dashboard
          </Link>
          <Note />
          <Suspense fallback={<Skeleton rows={12} />}>
            <Report params={props.params} />
          </Suspense>
        </main>
      </Page>
    </>
  );
}
