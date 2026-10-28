"use client";
// The task page, per step: the ideal step (its video; a placeholder until a clip exists) and its details from the
// SOP revision the check runs on. Display only: the check logic is not touched.
import { fmtClock } from "@/lib/client/hooks";
import { useSopStep } from "@/lib/client/sopContext";
import { Chip, Panel } from "../ui";

/** The right half of the media panel: the step done the ideal way. No clip is recorded yet, so a placeholder. */
export function IdealStep({ step }: { step: number }) {
  const s = useSopStep()(step);
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="ideal-step">
      <div className="flex items-center gap-3">
        <h2 className="text-[20px] font-semibold">Ideal step</h2>
        <Chip>Step {step}</Chip>
      </div>
      <div
        role="img"
        aria-label={`Video of step ${step}: not recorded yet`}
        data-testid="step-video"
        className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-1.5 rounded-[10px] bg-ink px-3 text-center text-on-strong"
      >
        <span aria-hidden className="flex size-11 items-center justify-center rounded-full border-2 border-on-strong text-[18px]">
          ▶
        </span>
        <span className="text-[16px]">Video: not recorded yet</span>
      </div>
      <span className="truncate text-[16px] text-ink-2">{s.name}</span>
    </div>
  );
}

export function StepDetails({ step }: { step: number }) {
  const s = useSopStep()(step);
  return (
    <Panel>
      <h2 className="text-[22px] font-semibold" data-testid="step-details-title">
        Step details
      </h2>
      <dl className="grid grid-cols-[1fr_1fr_auto] gap-4 text-[17px]" data-testid="step-details">
        <div>
          <dt className="text-[15px] text-muted">What to do</dt>
          <dd>{s.todo}</dd>
        </div>
        <div>
          <dt className="text-[15px] text-muted">What correct looks like</dt>
          <dd>{s.correct}</dd>
        </div>
        <div>
          <dt className="text-[15px] text-muted">Target time</dt>
          <dd data-testid="step-target">{s.targetCtSeconds === null ? "[set by plant]" : fmtClock(s.targetCtSeconds * 1000)}</dd>
        </div>
      </dl>
    </Panel>
  );
}
