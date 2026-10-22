// /supervisor/analytics: first-time right per week, and each step's median time against its target.
import { connection } from "next/server";
import { Suspense } from "react";
import { Gate } from "@/components/auth/Gate";
import { Card, cx } from "@/components/ds";
import { Empty, Section, isMissing, load, minutes } from "@/components/supervisor/parts";
import { SupervisorPage } from "@/components/supervisor/SupervisorShell";
import { analytics } from "@/lib/server/supervisor";

export const metadata = { title: "FactoryLens AI: Analytics" };

const dayMonth = (ymd: string) => {
  const [, m, d] = ymd.split("-").map(Number);
  return `${d}/${m}`;
};

async function Body() {
  await connection();
  const a = await load(() => analytics());
  if (isMissing(a)) return <Card className="px-6 py-5 text-[17px]">{a.notConfigured}</Card>;
  const anyWeek = a.weeks.some((w) => w.completed > 0);
  const timed = a.steps.filter((s) => s.medianSeconds !== null);
  const max = Math.max(1, ...a.steps.map((s) => Math.max(s.medianSeconds ?? 0, s.targetSeconds ?? 0)));
  return (
    <>
      <Section title="First-time right per week" testId="ftr-weeks">
        <p className="text-[15px] text-muted">Completed checks with all 12 steps correct on the first attempt. Last 8 weeks, week starting Monday.</p>
        {!anyWeek ? (
          <Empty>No completed checks in the last 8 weeks yet.</Empty>
        ) : (
          <div className="flex h-[240px] items-end gap-3" role="list">
            {a.weeks.map((w) => (
              <div key={w.start} role="listitem" className="flex h-full flex-1 flex-col items-center justify-end gap-1.5" data-week={w.start}>
                <span className="text-[14px] font-semibold">{w.ftrPct === null ? "—" : `${w.ftrPct}%`}</span>
                <span className="w-full max-w-[56px] rounded-t-[6px] bg-primary" style={{ height: `${Math.max(w.ftrPct ?? 0, 1) * 1.6}px` }} aria-hidden />
                <span className="text-[13px] text-muted">{dayMonth(w.start)}</span>
                <span className="text-[12px] text-muted">{w.completed} checks</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Time per step against the target" testId="step-times">
        <p className="text-[15px] text-muted">Median time of each step in completed checks, last 30 days. The mark is the step&apos;s target in the Active SOP.</p>
        {timed.length === 0 ? (
          <Empty>No completed checks in the last 30 days yet.</Empty>
        ) : (
          <ol className="flex flex-col gap-2.5">
            {a.steps.map((s) => {
              const over = s.medianSeconds !== null && s.targetSeconds !== null && s.medianSeconds > s.targetSeconds;
              return (
                <li key={s.step} className="grid grid-cols-[minmax(0,220px)_1fr_120px] items-center gap-3" data-step={s.step}>
                  <span className="truncate text-[15px]">
                    {s.step}. {s.name}
                  </span>
                  <span className="relative h-5 rounded-full bg-surface-2">
                    {s.medianSeconds !== null && <span className={cx("absolute inset-y-0 left-0 rounded-full", over ? "bg-amber" : "bg-primary")} style={{ width: `${(s.medianSeconds / max) * 100}%` }} />}
                    {s.targetSeconds !== null && <span className="absolute -inset-y-1 w-0.5 bg-ink" style={{ left: `${(s.targetSeconds / max) * 100}%` }} title="Target" />}
                  </span>
                  <span className={cx("text-right text-[14px]", over ? "font-semibold text-amber-ink" : "text-ink-2")}>
                    {minutes(s.medianSeconds)} / {s.targetSeconds === null ? "no target" : minutes(s.targetSeconds)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </Section>
    </>
  );
}

export default function AnalyticsPage() {
  return (
    <Gate area="supervisor" next="/supervisor/analytics">
      <SupervisorPage current="analytics" title="Analytics" sub="First-time right and time per step, from real checks only.">
        <Suspense fallback={<p className="text-[17px] text-muted">Loading…</p>}>
          <Body />
        </Suspense>
      </SupervisorPage>
    </Gate>
  );
}
