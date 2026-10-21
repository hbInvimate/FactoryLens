"use client";
// The task page, per step: the step's video (a placeholder until recording exists) and its details from the
// SOP revision the check runs on. Display only: the check logic is not touched.
import { fmtClock } from "@/lib/client/hooks";
import { useSopStep } from "@/lib/client/sopContext";
import { Chip, Panel } from "../ui";

export function StepVideo({ step }: { step: number }) {
  const s = useSopStep()(step);
  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-3.5">
        <h2 className="text-[22px] font-semibold">Step video</h2>
        <Chip>Step {step}</Chip>
      </div>
      <div
        role="img"
        aria-label={`Video of step ${step}: not recorded yet`}
        data-testid="step-video"
        className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-[10px] bg-ink text-on-strong"
      >
        <span aria-hidden className="flex size-14 items-center justify-center rounded-full border-2 border-on-strong text-[22px]">
          ▶
        </span>
        <span className="text-[17px]">Video: not recorded yet</span>
        <span className="text-[14px] opacity-80">{s.name}</span>
      </div>
    </Panel>
  );
}

export function StepDetails({ step }: { step: number }) {
  const s = useSopStep()(step);
  return (
    <Panel>
      <h2 className="text-[22px] font-semibold" data-testid="step-details-title">
        Step details
      </h2>
      <dl className="flex flex-col gap-3 text-[18px]" data-testid="step-details">
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
