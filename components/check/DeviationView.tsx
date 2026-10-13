"use client";
import { useState } from "react";
import { checkPointsDone, conformanceSoFar, elapsedMs, missingPoints, stepsDone } from "@/lib/check/reducer";
import { deviationText } from "@/lib/check/text";
import type { CheckState, Deviation } from "@/lib/check/types";
import { fmtClock } from "@/lib/client/hooks";
import { compressIds, describePoints, missingVerb, step as sopStep, TOTAL_CHECK_POINTS } from "@/lib/sop";
import { Banner, Bars, Btn, Dot, Frame, Speaker, Stat, cx } from "../ui";
import { LodgeButton } from "./MainView";
import { MiniStepList } from "./StepList";
import { PointGrid, type PointLook } from "./PointGrid";

export const TRAINER_AFTER = 3;

function Pane({ title, tone, children, caption }: { title: string; tone: "red" | "amber" | "green"; children: React.ReactNode; caption: string }) {
  const border = { red: "border-red", amber: "border-amber", green: "border-green" }[tone];
  return (
    <section className={cx("flex min-w-0 flex-1 flex-col gap-3 rounded-xl border-[3px] bg-panel p-4", border)}>
      <h2 className="text-[22px] font-semibold">{title}</h2>
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-lg bg-well px-5 py-5">{children}</div>
      <p className="text-[18px] text-ink2">{caption}</p>
    </section>
  );
}

export function DeviationView({
  state, dev, now, onTap, onRelease, onFixed, onTrainer, onLodge,
}: {
  state: CheckState;
  dev: Deviation;
  now: number;
  onTap: (step: number, point: string) => void;
  onRelease: (step: number) => void;
  onFixed: (id: string) => void;
  onTrainer: (id: string) => void;
  onLodge: () => void;
}) {
  const t = deviationText(dev);
  const tone = dev.kind === "wrong_order" ? "red" : "amber";
  const def = sopStep(dev.step);
  const run = state.steps[dev.step - 1];
  const confirmed = new Set(run.confirmed.map((c) => c.point));
  const missing = missingPoints(run);
  const fixedNow = missing.length === 0 && !run.needsRelease;
  const conf = conformanceSoFar(state);
  const ink = tone === "red" ? "text-red-soft" : "text-amber-soft";
  const [nudge, setNudge] = useState(false);
  const notYet = run.needsRelease
    ? "Release all clamps first, then tap C1 to C6 in order."
    : def.ordered
      ? `Tap clamps C1 to C6 first. ${missing[0]} is next.`
      : `Tap ${describePoints(missing)} first.`;

  const look = (p: string): PointLook => {
    if (run.wrong.includes(p)) return "wrong";
    if (confirmed.has(p)) return "done";
    return dev.kind === "skipped" && dev.missing.includes(p) ? "missing" : "open";
  };

  let status: string;
  if (fixedNow) status = def.ordered ? "All closed, in order" : `All ${def.points.length} checked`;
  else if (run.needsRelease) status = `${run.wrong[0]} closed before ${missing[0]}`;
  else if (def.ordered) status = `${missing[0]} closes next`;
  else status = `${compressIds(missing.filter((p) => p[0] === missing[0][0]))}${missing.some((p) => p[0] !== missing[0][0]) ? " and more" : ""} ${missingVerb(dev.step)}`;

  const caption =
    dev.kind === "wrong_order" || dev.step === 12 ? t.detail : t.detail.replace("moved on without", `moved on to step ${dev.step + 1} without`);

  return (
    <>
      <Frame tone={tone} />
      <Banner tone={tone} title={t.title} sub={t.sub} chip={`Attempt ${dev.failed}`} />
      <div className="flex min-h-0 flex-1 gap-6 px-8 py-6">
        <aside className="flex w-[290px] flex-none flex-col gap-2 rounded-[14px] bg-panel2 px-2 py-3.5">
          <span className="px-3 pb-1 text-[19px] font-semibold">SOP · Step {dev.step} of 12</span>
          <MiniStepList state={state} flag={dev.step} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <div className="flex gap-5">
            <Pane title="Quality Technician now" tone={tone} caption={caption}>
              <PointGrid
                label={`Step ${dev.step} points, your view`}
                points={def.points}
                ordered={def.ordered}
                look={look}
                disabled={run.needsRelease}
                onTap={(p) => onTap(dev.step, p)}
              />
              <span className={cx("text-[30px]", fixedNow ? "text-green" : ink)} data-testid="dev-status">
                {status}
              </span>
            </Pane>
            <Pane title="Reference from training" tone="green" caption={`Expected: ${def.correct}`}>
              <PointGrid
                label={`Step ${dev.step} points, reference`}
                points={def.points}
                ordered={def.ordered}
                look={(p) => (dev.kind === "wrong_order" ? (def.points.indexOf(p) < def.points.indexOf(dev.expected!) + 1 ? "done" : "open") : "done")}
              />
              <span className="text-[30px] text-green">
                {dev.kind === "wrong_order" ? `${dev.expected} closes next` : `all ${def.points.length} ${def.ordered ? "closed" : "checked"}`}
              </span>
            </Pane>
          </div>

          <div className={cx("flex items-center gap-5 rounded-xl border-2 bg-deep px-6 py-4", tone === "red" ? "border-red" : "border-amber")}>
            <Speaker />
            <Bars />
            <span className={cx("text-[40px] font-semibold leading-tight", ink)}>{t.correction}</span>
            <span className="flex-1" />
            <span className="flex items-center gap-2 whitespace-nowrap text-base text-ink2" data-testid="clip-saved">
              <Dot color="red" />
              Clip saved
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {def.ordered && (
              <Btn onClick={() => onRelease(dev.step)} variant={run.needsRelease ? "amber" : "ghost"}>
                Release all clamps
              </Btn>
            )}
            <span className={cx("text-[18px]", nudge && !fixedNow ? cx("font-semibold text-[22px]", ink) : "text-soft")} data-testid="dev-hint">
              {nudge && !fixedNow
                ? notYet
                : run.needsRelease
                ? "Release all the clamps, then close them again from C1."
                : fixedNow
                  ? "Done. Tap Fixed, continue."
                  : dev.kind === "skipped"
                    ? `Check ${describePoints(missing)}, tapping each one.`
                    : `Close ${missing[0]} next.`}
            </span>
            <span className="flex-1" />
            <LodgeButton onClick={onLodge} />
            <Btn variant="success" onClick={() => (fixedNow ? onFixed(dev.id) : setNudge(true))}>
              Fixed, continue
            </Btn>
          </div>

          {dev.failed >= TRAINER_AFTER && (
            <div className="flex items-center gap-5 rounded-xl border-2 border-amber bg-panel px-5 py-3" data-testid="expert-clip">
              <div className="flex h-[72px] w-[128px] flex-none items-center justify-center rounded-lg bg-well text-sm text-muted">
                Expert clip
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-[19px] font-semibold">Three attempts on this step. Watch the expert clip.</span>
                <span className="text-[16px] text-soft">Placeholder: expert clips are added with video capture. A trainer can help now.</span>
              </div>
              {dev.trainerCalledAt ? (
                <span className="text-[18px] text-amber-soft">Trainer called. Keep the part as it is.</span>
              ) : (
                <Btn variant="amber" onClick={() => onTrainer(dev.id)}>
                  Call a trainer
                </Btn>
              )}
            </div>
          )}

          <div className="flex gap-3.5">
            <Stat label="Steps done" value={`${stepsDone(state)} / 12`} />
            <Stat label="Check points" value={`${checkPointsDone(state)} / ${TOTAL_CHECK_POINTS}`} />
            <Stat label="Time elapsed" value={fmtClock(elapsedMs(state, now))} />
            <Stat label="Deviations" value={String(state.deviations.length)} tone="amber" />
            <Stat label="Conformance so far" value={conf === null ? "—" : `${conf}%`} />
          </div>
        </div>
      </div>
    </>
  );
}
