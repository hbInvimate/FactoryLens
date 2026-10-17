"use client";
import { checkPointsDone, conformanceSoFar, elapsedMs, stepsDone } from "@/lib/check/reducer";
import type { CheckState } from "@/lib/check/types";
import { fmtClock } from "@/lib/client/hooks";
import { useSopRevision, useSopStep } from "@/lib/client/sopContext";
import type { Action } from "@/lib/check/types";
import { MEASURED_STEPS, MeasureEntry, latestValues } from "./MeasureEntry";
import { checkTargetSeconds } from "@/lib/sop-revisions";
import { STEPS, TOTAL_CHECK_POINTS } from "@/lib/sop";
import { Btn, Chip, Panel, Ring, TabletIcon, Tick, Tile, Warn, cx } from "../ui";
import { PartDrawing } from "./PartDrawing";
import { PointGrid } from "./PointGrid";

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

export function MainView({
  state, now, onTap, onNext, onOpenStep, onLodge, actions = [], onMeasure,
}: {
  state: CheckState;
  /** The session's actions, for the values recorded at steps 7 to 10. */
  actions?: Action[];
  onMeasure?: (step: number, point: string, value: number, typed: string) => void;
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

  return (
    <div className="flex min-h-0 flex-1 gap-6 px-8 py-6">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-[14px] bg-surface px-4 py-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-3">
          <h2 className="text-2xl font-semibold">SOP: first-off check</h2>
          <span className="text-[18px] text-muted">
            Step {cur} of 12 · {def.phase}
          </span>
          <span className="flex-1" />
          <LodgeButton onClick={onLodge} />
        </div>

        <ol className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto pr-1">
          {STEPS.map((s) => {
            const r = state.steps[s.n - 1];
            if (s.n === cur) {
              return (
                <li key={s.n} aria-current="step" className="my-1 flex flex-col gap-3 rounded-[var(--fl-radius-md)] border-2 border-blue bg-blue-soft px-4 py-3">
                  <div className="flex items-start gap-4">
                    <Ring n={s.n} active />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="text-[26px] font-semibold leading-tight">{s.name}</span>
                      <span className="text-[17px] text-ink-2">Correct: {sopStep(s.n).correct}</span>
                    </div>
                  </div>
                  {s.points.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-[16px] text-muted">
                        {s.ordered
                          ? "Tap each clamp as you close it, in order."
                          : "Tap each point when you have tried the pin or gauge there."}{" "}
                        {r.confirmed.length} of {s.points.length}
                      </span>
                      <PointGrid
                        label={`Step ${s.n} points`}
                        points={s.points}
                        ordered={s.ordered}
                        look={(p) => (confirmed.has(p) ? "done" : "open")}
                        onTap={(p) => onTap(s.n, p)}
                      />
                      {onMeasure && MEASURED_STEPS.includes(s.n) && (
                        <MeasureEntry
                          step={s.n}
                          points={s.points}
                          confirmed={confirmed}
                          values={latestValues(actions, s.n)}
                          onRecord={(p, v, typed) => onMeasure(s.n, p, v, typed)}
                        />
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <Btn onClick={() => onOpenStep(s.n)}>Step details</Btn>
                    <span className="flex-1" />
                    <Btn variant="success" onClick={() => onNext(s.n)}>
                      {s.points.length ? (s.n === 12 ? "Finish the check" : "Next step") : s.n === 12 ? "Done, finish the check" : "Done, next step"}
                    </Btn>
                  </div>
                </li>
              );
            }
            const isDone = r.doneAt !== null;
            return (
              <li key={s.n}>
                <button
                  type="button"
                  onClick={() => onOpenStep(s.n)}
                  className="tap flex w-full items-center gap-4 rounded-[10px] px-3.5 text-left hover:bg-surface"
                >
                  {isDone ? <Tick tone={r.outcome === "corrected" ? "amber" : "green"} /> : <Ring n={s.n} />}
                  <span className={cx("text-[19px]", isDone ? "text-muted" : "text-ink")}>{s.name}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="flex min-w-0 flex-[1.1] flex-col gap-4">
        <Panel>
          <div className="flex flex-wrap items-center gap-3.5">
            <h2 className="text-[22px] font-semibold">What the camera sees</h2>
            <Chip>Placeholder view</Chip>
            <span className="flex-1" />
            <Chip tone="green">On track</Chip>
          </div>
          <PartDrawing step={cur} className="block h-auto w-full rounded-[10px]" />
          <span className="text-[18px] text-ink-2">Now: {def.name}.</span>
        </Panel>

        <div className="grid grid-cols-3 gap-3">
          <Tile label="Steps done" value={`${done} / 12`} sub={devs ? "Deviations corrected" : "On track"} />
          <Tile label="Check points" value={`${checkPointsDone(state)} / ${TOTAL_CHECK_POINTS}`} sub="Sequence only" />
          <Tile label="Time elapsed" value={fmtClock(elapsedMs(state, now))} sub={`Target: ${target === null ? "[set by plant]" : fmtClock(target * 1000)}`} />
          <Tile label="Deviations" value={String(devs)} sub={devs ? "See the step list" : "None yet"} tone={devs ? "amber" : "green"} />
          <Tile label="Conformance" value={conf === null ? "—" : `${conf}%`} sub="So far" tone="green" />
          <Tile label="Phase" value={def.phase} sub="" />
        </div>

        <div className="flex items-center gap-4 rounded-xl bg-surface px-5 py-3.5">
          <TabletIcon />
          <span className="text-[17px] text-ink-2">Reminder: enter readings on the tablet as you go. They are not shown here.</span>
        </div>
      </div>
    </div>
  );
}
