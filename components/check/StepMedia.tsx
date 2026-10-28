"use client";
// The task page, per step: the video panels (plain placeholders until videos exist) and the step's details from the
// SOP revision the check runs on. Display only: the check logic is not touched.
import { fmtClock } from "@/lib/client/hooks";
import { useSopStep } from "@/lib/client/sopContext";
import { Panel } from "../ui";

/** A video panel: a title, then a plain black 16:9 box with centred white text until a video exists. */
export function VideoBox({ title, text, testId, boxTestId }: { title: string; text: string; testId: string; boxTestId: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid={testId}>
      <h2 className="truncate text-[18px] font-semibold">{title}</h2>
      <div
        role="img"
        aria-label={text}
        data-testid={boxTestId}
        className="flex aspect-video w-full items-center justify-center rounded-[10px] bg-ink px-4 text-center text-[16px] text-on-strong"
      >
        {text}
      </div>
    </div>
  );
}

export function StepDetails({ step }: { step: number }) {
  const s = useSopStep()(step);
  return (
    <Panel className="py-3">
      <h2 className="text-[18px] font-semibold" data-testid="step-details-title">
        Step details
      </h2>
      <dl className="grid grid-cols-[1fr_1fr_auto] gap-4 text-[16px]" data-testid="step-details">
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
