"use client";
// Screens 05 to 08: pick the step, pick what is wrong, then fix it, try a fix, or lodge and call.
import { useState } from "react";
import { issuesFor, KIND_LABEL, type Issue, type IssueKind } from "@/lib/issues";
import { STEPS, stepLabel } from "@/lib/sop";
import { Banner, Btn, Chip, Frame, Panel, Ring, Tick, cx } from "../ui";

type Stage = { at: "steps" } | { at: "issues"; step: number } | { at: "fix"; step: number; issue: Issue; ticks: boolean[] };

const KIND_TONE: Record<IssueKind, "green" | "amber" | "red"> = { self: "green", try: "amber", lodge: "red" };

export function KindChip({ kind }: { kind: IssueKind }) {
  return <Chip tone={KIND_TONE[kind]}>{KIND_LABEL[kind]}</Chip>;
}

function Bottom({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-none flex-wrap items-center gap-3.5 pt-2">{children}</div>;
}

export function LodgeFlow({
  current, onCancel, onFixed, onLodge,
}: {
  current: number;
  onCancel: () => void;
  onFixed: (step: number, issue: Issue, done: string[]) => void;
  onLodge: (step: number, issue: Issue, tried: string[]) => void;
}) {
  const [stage, setStage] = useState<Stage>({ at: "steps" });
  const here = current <= 12 ? current : 0;

  if (stage.at === "steps") {
    return (
      <>
        <Frame tone="blue" />
        <Banner tone="blue" title="Lodge a discrepancy" sub="Which step is the problem in?" chip={here ? `Step ${here} is where you are` : "The check is done"} />
        <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-8 py-6">
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
            {STEPS.map((s) => {
              const cur = s.n === here;
              return (
                <button
                  key={s.n}
                  type="button"
                  onClick={() => setStage({ at: "issues", step: s.n })}
                  className={cx(
                    "tap flex min-h-[62px] items-center gap-3.5 rounded-[var(--fl-radius-md)] border px-4 py-3 text-left",
                    cur ? "border-blue bg-blue-soft" : "border-line bg-surface hover:border-line-strong",
                  )}
                >
                  <Ring n={s.n} size={30} active={cur} />
                  <span className={cx("flex-1 text-[20px]", cur && "font-semibold")}>{s.name}</span>
                  {cur && <span className="text-[17px] text-blue-ink">You are here</span>}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setStage({ at: "issues", step: 0 })}
            className="tap flex items-center gap-3 rounded-[var(--fl-radius-md)] border border-line bg-surface px-[18px] py-3.5 text-left hover:border-line-strong"
          >
            <span className="text-[20px] font-semibold">Not about a step</span>
            <span className="text-base text-muted">Camera, tablet, fixture, safety or something else</span>
          </button>
          <div className="flex-1" />
          <Bottom>
            <Btn onClick={onCancel}>Cancel, back to the check</Btn>
          </Bottom>
        </div>
      </>
    );
  }

  if (stage.at === "issues") {
    const list = issuesFor(stage.step);
    return (
      <>
        <Frame tone="blue" />
        <Banner tone="blue" title={stepLabel(stage.step)} sub="What is wrong?" chip="Lodge a discrepancy" />
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-8 py-6">
          <div className="flex min-h-0 flex-1 gap-[18px]">
            <div className="flex min-w-0 flex-[1.7] flex-col gap-2.5 overflow-y-auto">
              {list.map((i) => (
                <button
                  key={i.label}
                  type="button"
                  onClick={() =>
                    i.kind === "lodge"
                      ? onLodge(stage.step, i, [])
                      : setStage({ at: "fix", step: stage.step, issue: i, ticks: i.fix.map(() => false) })
                  }
                  className="tap flex items-center gap-3.5 rounded-[var(--fl-radius-md)] border border-line bg-surface px-4 py-2.5 text-left hover:border-line-strong"
                >
                  <span className="flex flex-1 flex-col gap-0.5">
                    <span className="text-[20px] font-medium">{i.label}</span>
                    <span className="text-[15px] text-muted">{i.who.length ? `Calls: ${i.who.join(", ")}` : "No call needed"}</span>
                  </span>
                  <KindChip kind={i.kind} />
                </button>
              ))}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-3.5">
              <Panel title="How this works">
                <p className="text-base text-ink-2">You pick what is wrong. The screen then tells you one of three things:</p>
                <div className="flex flex-col items-start gap-2">
                  <KindChip kind="self" />
                  <p className="text-base text-ink-2">Do the steps, then check again and carry on.</p>
                  <KindChip kind="try" />
                  <p className="text-base text-ink-2">Do the steps. If it works, carry on. If not, lodge it.</p>
                  <KindChip kind="lodge" />
                  <p className="text-base text-ink-2">It is logged and the people are called. The screen says if the check stops.</p>
                </div>
              </Panel>
            </div>
          </div>
          <Bottom>
            <Btn onClick={() => setStage({ at: "steps" })}>Back</Btn>
            <Btn onClick={onCancel}>Cancel, back to the check</Btn>
          </Bottom>
        </div>
      </>
    );
  }

  const { issue, ticks, step } = stage;
  const isTry = issue.kind === "try";
  const allDone = ticks.every(Boolean);
  const done = issue.fix.filter((_, k) => ticks[k]);
  return (
    <>
      <Frame tone={isTry ? "amber" : "green"} />
      <Banner tone={isTry ? "amber" : "green"} title={isTry ? "Try this first" : "Fix it yourself"} sub={issue.label} chip={step ? `Step ${step}` : "Not about a step"} />
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-8 py-6">
        <div className="flex min-h-0 flex-1 gap-[18px]">
          <div className="flex min-w-0 flex-[1.3] flex-col gap-3.5">
            <Panel title="Do these steps, tap each when done">
              {issue.fix.map((f, k) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={ticks[k]}
                  onClick={() => setStage({ ...stage, ticks: ticks.map((t, j) => (j === k ? !t : t)) })}
                  className={cx("tap flex items-center gap-3.5 rounded-[10px] px-3.5 py-1.5 text-left", ticks[k] ? "bg-transparent" : "bg-blue-soft")}
                >
                  {ticks[k] ? <Tick /> : <Ring n={k + 1} active />}
                  <span className={cx("text-[20px]", ticks[k] ? "text-muted" : "text-ink")}>{f}</span>
                </button>
              ))}
            </Panel>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-3.5">
            <Panel title="What happens next">
              <p className="text-base text-ink-2">
                {isTry
                  ? 'If it works, tap "Fixed, check again". You go back to the check and carry on from where you were. If not, lodge it and the people below are called.'
                  : 'Tap "Fixed, check again" when done. You go back to the check and carry on from where you were.'}
              </p>
              {issue.who.length > 0 && <p className="text-base text-ink-2">If lodged, calls: {issue.who.join(", ")}.</p>}
            </Panel>
            {issue.note && <Panel title="Good to know"><p className="text-base text-ink-2">{issue.note}</p></Panel>}
          </div>
        </div>
        <Bottom>
          <Btn onClick={() => setStage({ at: "issues", step })}>Back</Btn>
          <span className="flex-1" />
          <Btn variant="danger" onClick={() => onLodge(step, issue, done)}>
            {isTry ? "Did not work: lodge and call" : "Cannot fix it: lodge and call"}
          </Btn>
          <Btn variant="success" disabled={!allDone} onClick={() => onFixed(step, issue, done)} title={allDone ? undefined : "Tap each step when done"}>
            Fixed, check again
          </Btn>
        </Bottom>
      </div>
    </>
  );
}
