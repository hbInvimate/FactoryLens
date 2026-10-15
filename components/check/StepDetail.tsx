"use client";
import type { CheckState } from "@/lib/check/types";
import { fmtClock } from "@/lib/client/hooks";
import { step as sopStep } from "@/lib/sop";
import { Bars, Btn, Chip, Speaker, Warn } from "../ui";
import { PartDrawing } from "./PartDrawing";
import { MiniStepList } from "./StepList";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-surface px-4 py-3">
      <span className="text-[15px] font-medium text-muted">{title}</span>
      <div className="text-[18px] leading-snug">{children}</div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-2xl font-semibold">{value}</span>
    </div>
  );
}

/** Screen 02: what to do, what correct looks like, and the spoken line. Read-only. */
export function StepDetail({
  state, n, now, onPick, onClose, onSay, voice,
}: {
  state: CheckState;
  n: number;
  now: number;
  onPick: (n: number) => void;
  onClose: () => void;
  onSay: (text: string) => void;
  voice: boolean;
}) {
  const s = sopStep(n);
  const run = state.steps[n - 1];
  const devs = state.deviations.filter((d) => d.step === n);
  const status = run.doneAt !== null ? "Done" : state.current === n ? "In progress" : "Waiting";
  const first = devs.length ? (devs[0].kind === "wrong_order" ? "Wrong order" : "Skipped") : run.doneAt !== null ? "Correct" : "Pending";
  const onStep = run.startedAt === null ? "—" : fmtClock((run.doneAt ?? now) - run.startedAt);

  return (
    <div className="flex min-h-0 flex-1 gap-6 px-8 py-6">
      <aside className="flex w-[520px] flex-none flex-col gap-1 overflow-y-auto rounded-[14px] bg-surface px-3 py-[18px]">
        <div className="flex items-baseline justify-between px-3.5 pb-2.5">
          <span className="text-[22px] font-semibold">SOP: first-off check</span>
          <span className="text-base text-muted">Step {Math.min(state.current, 12)} of 12</span>
        </div>
        <MiniStepList state={state} selected={n} onPick={onPick} short={false} />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto rounded-[14px] bg-surface px-6 py-[22px]">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex size-10 items-center justify-center rounded-full border-2 border-blue text-xl">{n}</span>
          <h1 className="text-[34px] font-semibold leading-tight">{s.name}</h1>
          <Chip tone="blue">{s.phase}</Chip>
          <Chip>{status}</Chip>
          <span className="flex-1" />
          <Btn className="rounded-full" onClick={onClose}>
            ✕ Close
          </Btn>
        </div>

        <div className="flex flex-wrap gap-6">
          <div className="flex w-[520px] max-w-full flex-col gap-3">
            <div className="relative">
              <PartDrawing step={n} className="block h-auto w-full rounded-xl" />
              <span aria-hidden className="absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-ink bg-surface-2/75">
                <svg width="24" height="24" viewBox="0 0 24 24"><path d="M7 4 l13 8 l-13 8 z" fill="currentColor" /></svg>
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-base text-muted">Reference clip (placeholder)</span>
              <span className="flex-1" />
              <Chip tone="green">{s.camera}</Chip>
            </div>
            {s.rule && (
              <div className="flex items-center gap-3.5 rounded-[var(--fl-radius-md)] border-2 border-amber bg-amber-soft px-4 py-3">
                <Warn />
                <span className="text-[18px] font-medium text-amber-ink">{s.rule}</span>
              </div>
            )}
          </div>

          <div className="flex min-w-[280px] flex-1 flex-col gap-2.5">
            <Section title="What to do">{s.todo}</Section>
            <Section title="What correct looks like">{s.correct}</Section>
            <Section title="Common mistakes">{s.mistake}</Section>
            <Section title="What you will hear">
              The glasses speak this line. Nothing is drawn on the lens:
              <button
                type="button"
                onClick={() => onSay(s.spoken)}
                disabled={!voice}
                title={voice ? "Play the line" : "Turn the voice on to hear it"}
                className="tap mt-1.5 flex w-full items-center gap-3 rounded-[10px] bg-surface-2 px-3.5 py-2.5 text-left"
              >
                <Speaker size={30} />
                <Bars live={false} />
                <span className="text-[19px] font-semibold">{s.spoken}</span>
              </button>
            </Section>
          </div>
        </div>

        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-9 rounded-xl bg-surface px-5 py-3.5">
          <Fact label="First attempt" value={first} />
          <Fact label="Time on step" value={onStep} />
          <Fact label="Status" value={status} />
          <Fact label="Check points" value={s.points.length ? `${run.confirmed.length} of ${s.points.length}` : s.seating.length ? "Seating" : "Setup step"} />
          <span className="flex-1" />
          <Btn className="rounded-full" disabled={n <= 1} onClick={() => onPick(n - 1)}>
            Step {Math.max(1, n - 1)}
          </Btn>
          <Btn className="rounded-full" disabled={n >= 12} onClick={() => onPick(n + 1)}>
            Step {Math.min(12, n + 1)}
          </Btn>
        </div>
        <span className="text-[15px] text-muted">A deviation closes this view and shows the correction.</span>
      </section>
    </div>
  );
}
