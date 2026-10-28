"use client";
import { checkPointsDone, conformanceSoFar, elapsedMs, stepsDone } from "@/lib/check/reducer";
import type { CheckState } from "@/lib/check/types";
import { fmtClock } from "@/lib/client/hooks";
import { useSopRevision, useSopStep } from "@/lib/client/sopContext";
import type { Action } from "@/lib/check/types";
import { useState } from "react";
import { MEASURED_STEPS, MeasureEntry, latestValues, missingValues } from "./MeasureEntry";
import { checkTargetSeconds } from "@/lib/sop-revisions";
import { STEPS, TOTAL_CHECK_POINTS } from "@/lib/sop";
import { Btn, Panel, TabletIcon, Warn, cx } from "../ui";
import { Modal } from "./Dialogs";
import { StepDetails, VideoBox } from "./StepMedia";
import { PointGrid } from "./PointGrid";
import { StepTimeline } from "./StepTimeline";

export function LodgeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="tap inline-flex items-center gap-2 whitespace-nowrap rounded-full border-2 border-amber bg-amber-soft px-[18px] text-[18px] font-semibold text-amber-ink hover:bg-tile-amber"
    >
      <Warn size={22} />
      Lodge a discrepancy
    </button>
  );
}

/** One of the six compact metric cards in the row above the media panel. */
function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "green" | "amber" }) {
  return (
    <div className="flex min-w-0 flex-col rounded-[10px] border border-line bg-surface px-2.5 py-2 shadow-card">
      <span className="truncate text-[12px] text-muted">{label}</span>
      <span className={cx("truncate text-[22px] font-semibold leading-tight", tone === "amber" ? "text-amber-ink" : tone === "green" ? "text-primary-ink" : "text-ink")}>{value}</span>
      {sub && <span className="truncate text-[12px] text-muted">{sub}</span>}
    </div>
  );
}

export function MainView({
  state, now, onTap, onNext, onOpenStep, onLodge, onBack, actions = [], onMeasure, onFillDemo,
}: {
  /** Reopen an earlier, done step. The steps after it are then confirmed again, in order. */
  onBack?: (to: number) => void;
  state: CheckState;
  /** The session's actions, for the values recorded at steps 7 to 10. */
  actions?: Action[];
  onMeasure?: (step: number, point: string, value: number, typed: string) => void;
  /** "Fill demo values": invented values for the given open points, in order. */
  onFillDemo?: (step: number, points: string[]) => void;
  now: number;
  onTap: (step: number, point: string) => void;
  onNext: (step: number) => void;
  onOpenStep: (n: number) => void;
  onLodge: () => void;
}) {
  const sopStep = useSopStep();
  const target = checkTargetSeconds(useSopRevision());
  const cur = Math.min(state.current, 12);
  const def = sopStep(cur);
  const run = state.steps[cur - 1];
  const done = stepsDone(state);
  const devs = state.deviations.length;
  const conf = conformanceSoFar(state);
  const confirmed = new Set(run.confirmed.map((c) => c.point));
  // Steps 7 to 10: a value for every point, in order, before the step can be left (new checks; see MeasureEntry).
  const measured = !!onMeasure && MEASURED_STEPS.includes(cur) && def.points.length > 0;
  const values = measured ? latestValues(actions, cur) : new Map();
  const missing = measured ? missingValues(def.points, values) : [];
  const [promptStep, setPromptStep] = useState<number | null>(null);
  const [edit, setEdit] = useState<{ step: number; point: string } | null>(null);
  const nudge = () => setPromptStep(cur);
  // Going back asks first: it reopens a step and marks the ones after it "re-confirm".
  const [backTo, setBackTo] = useState<number | null>(null);
  const canBack = (n: number) => !!onBack && state.current <= 12 && n >= 1 && n < cur && state.steps[n - 1].doneAt !== null;

  return (
    <div className="flex min-h-0 flex-1 gap-6 px-8 py-4">
      {/* About 35% wide (at least 420 px); the right column takes the rest. */}
      <section className="flex min-h-0 w-[35%] min-w-[420px] flex-none flex-col rounded-[14px] bg-surface px-3 py-3">
        <div className="flex items-center gap-2 px-1 pb-2">
          <h2 className="whitespace-nowrap text-[18px] font-semibold">
            SOP: first-off check
          </h2>
          <span className="flex-1" />
          <LodgeButton onClick={onLodge} />
        </div>

        <StepTimeline
          state={state}
          cur={cur}
          // A done step reopens it (after a confirm); a step not reached yet shows its details.
          onRow={(n) => (canBack(n) ? setBackTo(n) : onOpenStep(n))}
          current={(() => {
            const s = STEPS[cur - 1];
            const r = run;
            return (
              <>
                  {s.points.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-[16px] text-muted">
                        {measured
                          ? `Record a value for each point, in order. ${s.points.length - missing.length} of ${s.points.length} recorded.`
                          : s.ordered
                            ? `Tap each clamp as you close it, in order. ${r.confirmed.length} of ${s.points.length}`
                            : `Tap each point when you have tried the pin or gauge there. ${r.confirmed.length} of ${s.points.length}`}
                      </span>
                      <PointGrid
                        label={`Step ${s.n} points`}
                        points={s.points}
                        ordered={s.ordered}
                        look={(p) => (confirmed.has(p) ? "done" : "open")}
                        doneTappable={measured}
                        timeline
                        next={measured ? missing[0] : s.ordered ? s.points.find((p) => !confirmed.has(p)) : undefined}
                        sub={(p) => {
                          const v = values.get(p);
                          return v && v.value !== null ? String(v.value) : undefined;
                        }}
                        onTap={(p) => {
                          if (!measured) return onTap(s.n, p);
                          // A value confirms the point: a tap picks a recorded point to correct, or asks for the open one.
                          if (!missing.includes(p)) setEdit({ step: s.n, point: p });
                          else nudge();
                        }}
                      />
                      {measured && onMeasure && (
                        <MeasureEntry
                          key={s.n}
                          step={s.n}
                          points={s.points}
                          values={values}
                          edit={edit?.step === s.n ? edit.point : null}
                          onEdit={(p) => setEdit(p ? { step: s.n, point: p } : null)}
                          prompt={promptStep === s.n}
                          onRecord={(p, v, typed) => {
                            onMeasure(s.n, p, v, typed);
                            setPromptStep(null);
                          }}
                          onFillDemo={
                            onFillDemo
                              ? (ps) => {
                                  onFillDemo(s.n, ps);
                                  setPromptStep(null);
                                }
                              : undefined
                          }
                        />
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Btn onClick={() => onOpenStep(s.n)}>Step details</Btn>
                    <span className="flex-1" />
                    {canBack(s.n - 1) && (
                      <Btn onClick={() => setBackTo(s.n - 1)} data-testid="back-step">
                        ← Back
                      </Btn>
                    )}
                    <Btn variant="success" onClick={() => (missing.length ? nudge() : onNext(s.n))}>
                      {s.points.length ? (s.n === 12 ? "Finish the check" : "Next step") : s.n === 12 ? "Done, finish the check" : "Done, next step"}
                    </Btn>
                  </div>
              </>
            );
          })()}
        />
      </section>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
        <div className="grid grid-cols-6 gap-2" data-testid="metrics">
          <Metric label="Steps done" value={`${done} / 12`} sub={devs ? "Deviations corrected" : "On track"} />
          <Metric label="Check points" value={`${checkPointsDone(state)} / ${TOTAL_CHECK_POINTS}`} sub="Sequence" />
          <Metric label="Time elapsed" value={fmtClock(elapsedMs(state, now))} sub={`Target ${target === null ? "[set by plant]" : fmtClock(target * 1000)}`} />
          <Metric label="Deviations" value={String(devs)} sub={devs ? "See the step list" : "None yet"} tone={devs ? "amber" : "green"} />
          <Metric label="Conformance" value={conf === null ? "—" : `${conf}%`} sub="So far" tone="green" />
          <Metric label="Phase" value={def.phase} />
        </div>

        <Panel className="py-3">
          <div className="grid grid-cols-2 items-start gap-4" data-testid="media">
            <VideoBox title="Technician cam" text="Technician cam video: Not recorded yet" testId="camera-view" boxTestId="cam-video" />
            <VideoBox title={`SOP video · Step ${cur}`} text="SOP video: Not recorded yet" testId="ideal-step" boxTestId="step-video" />
          </div>
        </Panel>

        <StepDetails step={cur} />

        <div className="flex items-center gap-4 rounded-xl bg-surface px-5 py-3.5">
          <TabletIcon />
          <span className="text-[17px] text-ink-2">Reminder: enter readings on the tablet as you go. They are not shown here.</span>
        </div>
      </div>
      {backTo !== null && onBack && (
        <Modal title={`Go back to step ${backTo}?`} onClose={() => setBackTo(null)}>
          <p className="text-[19px] text-ink-2">
            Step {backTo} opens again. {backTo < cur - 1 ? `Steps ${backTo} to ${cur - 1} stay recorded and are` : `Step ${backTo} stays recorded and is`} marked
            re-confirm: confirm each again, in order. This is logged. It is not a deviation.
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <Btn onClick={() => setBackTo(null)}>Cancel</Btn>
            <Btn
              variant="success"
              data-testid="confirm-back"
              onClick={() => {
                onBack(backTo);
                setBackTo(null);
              }}
            >
              Go back to step {backTo}
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}
