"use client";
// Screens 11 to 14b: "Part does not fit", the hole check procedure. The check continues; the cell is on hold.
// The process engineer corrects the program elsewhere. The app tracks; it never chooses the correction.
import { checkPointsDone, elapsedMs } from "@/lib/check/reducer";
import type { CheckState, Discrepancy, ProcState } from "@/lib/check/types";
import { fmtClock } from "@/lib/client/hooks";
import type { SyncState } from "@/lib/client/useCheckSession";
import {
  MAX_TRIALS, PROC_SCREENS, PROC_SECTIONS, section, TRIAL_OUTCOMES,
  type HandoffItem, type ProcItem, type SeenBy, type TrialOutcome,
} from "@/lib/procedure";
import { compressIds, STEPS, TOTAL_CHECK_POINTS } from "@/lib/sop";
import { Banner, Bars, Btn, Chip, Current, Frame, KV, Panel, Ring, Stat, Tick, cx, type Tone } from "../ui";
import { savedChip } from "./CompleteView";
import { LodgeButton } from "./MainView";
import { handoffDone } from "./StopViews";

const HOLES = STEPS[6].points;

const SEEN_TONE: Record<SeenBy, "green" | "gray" | "blue" | "violet" | "teal"> = {
  Camera: "green", Reminder: "gray", Tablet: "blue", Voice: "violet", Engineer: "teal",
};

function itemDone(d: Discrepancy, p: ProcState, it: ProcItem): boolean {
  return it.handoff ? handoffDone(d, it.handoff) : !!p.ticks[it.key];
}

function sectionDone(d: Discrepancy, p: ProcState, id: string): boolean {
  return section(id).items.every((it) => itemDone(d, p, it));
}

function HoleStrip({ confirmed, reported, onToggle }: { confirmed: Set<string>; reported: Set<string>; onToggle?: (h: string) => void }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface-3 p-3">
      <div className="grid grid-cols-7 gap-1.5 rounded-md border border-[var(--fl-draw-fixture-line)] bg-[var(--fl-draw-fixture)] p-2.5 xl:grid-cols-14">
        {HOLES.map((h) => {
          const out = reported.has(h);
          const ok = !out && confirmed.has(h);
          return (
            <button
              key={h}
              type="button"
              disabled={!onToggle}
              aria-pressed={out}
              aria-label={`${h}${out ? ", reported out" : ""}`}
              onClick={() => onToggle?.(h)}
              className={cx(
                "flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-md text-[13px] disabled:cursor-default",
                onToggle && "hover:bg-surface",
              )}
            >
              <span
                aria-hidden
                className={cx(
                  "flex size-6 items-center justify-center rounded-full border-2 text-[13px] font-bold",
                  out ? "border-red bg-surface text-red-ink" : ok ? "border-primary bg-primary" : "border-[var(--fl-draw-part-dark)] bg-surface",
                )}
              >
                {out ? "✕" : ""}
              </span>
              <span className={out ? "text-red-ink" : "text-ink-2"}>{h.slice(1)}</span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-[13px] text-muted">
        <span>Upper end</span>
        <span>Lower end</span>
      </div>
    </div>
  );
}

function MarkingDrawing({ holes }: { holes: string[] }) {
  const shown = (holes.length ? holes : ["H5", "H6", "H7", "H8"]).slice(0, 4);
  return (
    <svg viewBox="0 0 320 120" role="img" aria-label="How to mark each hole. Illustration only." className="block h-auto w-full rounded-lg bg-surface-3">
      <rect x="6" y="14" width="308" height="76" rx="6" fill="var(--fl-draw-fixture)" stroke="var(--fl-draw-fixture-line)" />
      {shown.map((h, i) => {
        const x = 40 + i * 78;
        return (
          <g key={h}>
            <circle cx={x} cy="52" r="13" fill="none" stroke="var(--fl-primary)" strokeWidth="1.8" strokeDasharray="3 3" />
            <circle cx={x + 12} cy="52" r="13" fill="var(--fl-red-soft)" fillOpacity="0.6" stroke="var(--fl-red)" strokeWidth="2" />
            <path d={`M${x - 3} 49 l6 6 M${x + 3} 49 l-6 6`} stroke="var(--fl-primary)" strokeWidth="1.8" />
            <path d={`M${x + 9} 49 l6 6 M${x + 15} 49 l-6 6`} stroke="var(--fl-red)" strokeWidth="1.8" />
            <path d={`M${x + 17} 70 L${x + 2} 70`} stroke="var(--fl-draw-highlight)" strokeWidth="1.8" />
            <text x={x + 6} y="84" textAnchor="middle" fontSize="9" fill="var(--fl-text-2)">{h}</text>
          </g>
        );
      })}
      <text x="160" y="110" textAnchor="middle" fontSize="10" fill="var(--fl-text-muted)">Green: target. Red: actual. Illustration only.</text>
    </svg>
  );
}

function ItemRow({ it, done, current, sub, onTap, disabled }: { it: ProcItem; done: boolean; current: boolean; sub?: string; onTap: () => void; disabled?: boolean }) {
  const repeatable = it.handoff === "photo";
  return (
    <button
      type="button"
      aria-pressed={done}
      disabled={disabled || (done && it.handoff !== undefined && !repeatable)}
      onClick={onTap}
      className={cx("tap flex w-full items-center gap-3.5 rounded-[10px] px-3 py-1.5 text-left disabled:cursor-default", current && "bg-blue-soft")}
    >
      {done ? <Tick size={26} /> : current ? <Current /> : <Ring size={26} />}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cx("text-[19px]", done ? "text-muted" : current ? "font-semibold text-ink" : "text-ink-2")}>{it.text}</span>
        {sub && <span className="text-[15px] text-muted">{sub}</span>}
      </span>
      <Chip small tone={SEEN_TONE[it.seen]}>
        {it.seen}
      </Chip>
    </button>
  );
}

export function Procedure({
  state, d, screen, now, sync, onScreen, onBack, onLodge, onTick, onHandoff, onHoles, onParts, onTrial, onClose,
}: {
  state: CheckState;
  d: Discrepancy;
  screen: number;
  now: number;
  sync: SyncState;
  onScreen: (i: number) => void;
  onBack: () => void;
  onLodge: () => void;
  onTick: (key: string) => void;
  onHandoff: (item: HandoffItem) => void;
  onHoles: (holes: string[]) => void;
  onParts: (n: number) => void;
  onTrial: (o: TrialOutcome) => void;
  onClose: () => void;
}) {
  const p = d.proc!;
  const reported = new Set(p.holes);
  const confirmed = new Set(state.steps[6].confirmed.map((c) => c.point));
  const holesText = p.holes.length ? compressIds(p.holes) : "";
  const holdMs = (d.closedAt ?? now) - d.loggedAt;
  const waiting = d.handoff.handedOverAt;
  const points = checkPointsDone(state);
  const passed = p.passedAt !== null;
  const escalated = d.status === "escalated";
  const released = d.status === "released";
  const trialNo = Math.min(p.trials.length + (passed || escalated ? 0 : 1), MAX_TRIALS);
  const def = PROC_SCREENS[screen];
  const items = def.sections.flatMap((id) => section(id).items);
  const firstOpen = items.find((it) => !itemDone(d, p, it))?.key;

  const tap = (it: ProcItem) => (it.handoff ? onHandoff(it.handoff) : onTick(it.key));
  const toggleHole = (h: string) => onHoles(reported.has(h) ? p.holes.filter((x) => x !== h) : [...p.holes, h]);

  const sub = (it: ProcItem): string | undefined => {
    switch (it.key) {
      case "A4": return p.ticks.A4 ? "Retry 1 of 1 used" : it.sub;
      case "C1": return `${points} of ${TOTAL_CHECK_POINTS} points covered`;
      case "D2": return `Tag: hold, first-off failed${holesText ? `, ${holesText}` : ""}`;
      case "E1": return d.handoff.marks ? `${p.holes.length || "All"} holes marked` : it.sub;
      case "E2": return `${d.handoff.photos} ${d.handoff.photos === 1 ? "photo" : "photos"}. Tap to add one.`;
      case "G4": return holesText ? `Check ${holesText} next. ${it.sub}` : it.sub;
      default: return it.sub;
    }
  };

  let tone: Tone = "red";
  let title = "";
  let subtitle = "";
  let chip = "";
  if (screen === 0) {
    title = `Hold: check pin won't enter ${p.holes[0] ?? "a hole"}`;
    subtitle = "Do not force the pin. Keep the part clamped.";
    chip = "Reported on the monitor";
  } else if (screen === 1) {
    title = "Hold: finish the full check, then contain";
    subtitle = holesText ? `${holesText} reported out` : "Tap the holes reported out";
    chip = `Parts on hold: ${p.parts}`;
  } else if (screen === 2) {
    title = "Hold: waiting for the process engineer";
    subtitle = "Do not unclamp. Stay with the part.";
    chip = waiting ? `Waiting ${fmtClock(now - waiting)}` : "Not handed over yet";
  } else if (screen === 3) {
    tone = escalated ? "red" : passed ? "green" : "amber";
    title = escalated ? "Escalated: stop correcting" : passed ? `Trial part ${p.trials.length} of ${MAX_TRIALS} passed` : `Trial part ${trialNo} of ${MAX_TRIALS}: re-check`;
    subtitle = escalated ? "Root cause is needed. The cell stays on hold." : "Seat and clamp exactly as in the standard check";
    chip = "Program revision on the tablet";
  } else {
    tone = released ? "green" : passed ? "green" : "amber";
    title = released ? "Hold closed" : passed ? "Trial passed: release and close" : "Release and close";
    subtitle = passed ? "Sign off on the tablet only when all 50 points pass" : "Only after a trial part passes";
    chip = savedChip(sync);
  }

  const phases = PROC_SECTIONS.map((s) => ({ id: s.id, name: s.phase, done: sectionDone(d, p, s.id), here: def.sections.includes(s.id) }));

  return (
    <>
      <Frame tone={tone} />
      <Banner tone={tone} title={title} sub={subtitle} chip={chip} />
      <div className="flex min-h-0 flex-1 gap-5 px-8 pb-3 pt-5">
        <aside className="flex w-[300px] flex-none flex-col gap-0.5 rounded-[14px] bg-surface px-2 py-4">
          <span className="px-3 pb-2 text-[19px] font-semibold">Part does not fit</span>
          {phases.map((ph, i) => (
            <button
              key={ph.id}
              type="button"
              onClick={() => onScreen(PROC_SCREENS.findIndex((s) => s.sections.includes(ph.id)))}
              className={cx("tap flex items-center gap-3 rounded-[10px] px-3 text-left", ph.here && !ph.done && "border-2 border-blue bg-blue-soft")}
            >
              {ph.done ? <Tick size={26} /> : ph.here ? <Current /> : <Ring n={i + 1} size={26} />}
              <span className={cx("text-[18px]", ph.done ? "text-muted" : ph.here ? "font-semibold" : "text-ink-2")}>{ph.name}</span>
            </button>
          ))}
          <div className="flex-1" />
          <span className="px-3 text-sm text-muted">Tags show where each step is seen: camera, voice, tablet, or a reminder only.</span>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex min-h-0 flex-1 gap-4 overflow-y-auto">
            <div className="flex min-w-0 flex-[1.25] flex-col gap-3.5">
              {def.sections.map((id) => {
                const s = section(id);
                return (
                  <section key={id} className="flex flex-col gap-0.5 rounded-[14px] bg-surface px-3 py-3.5">
                    <h2 className="px-3 pb-1.5 text-[20px] font-semibold">{s.title}</h2>
                    {s.items.map((it) => (
                      <ItemRow
                        key={it.key}
                        it={it}
                        done={itemDone(d, p, it)}
                        current={it.key === firstOpen}
                        sub={sub(it)}
                        disabled={(id === "H" && (!passed || released)) || (id === "G" && (passed || escalated))}
                        onTap={() => tap(it)}
                      />
                    ))}
                  </section>
                );
              })}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-3.5">
              {screen === 0 && (
                <>
                  <Panel title="Where the check stands">
                    <HoleStrip confirmed={confirmed} reported={reported} />
                    <span className="text-base text-ink-2">Feature IDs only. Measured values stay on the tablet.</span>
                  </Panel>
                  <div className="flex items-center gap-4 rounded-[14px] border-2 border-red bg-surface-2 px-[22px] py-4">
                    <Bars />
                    <span className="text-[30px] font-semibold text-red-ink">Do not force the pin</span>
                  </div>
                  <Panel title="Not this branch?">
                    <p className="text-[15px] text-muted">A pad gap over limit, or a locator pin that will not enter, is a seating failure. Stop the check and escalate.</p>
                  </Panel>
                </>
              )}
              {screen === 1 && (
                <>
                  <Panel title="Reported out so far">
                    <span className="text-[15px] text-muted">Tap the holes that will not take the pin.</span>
                    <HoleStrip confirmed={confirmed} reported={reported} onToggle={toggleHole} />
                    <span className="text-base text-ink-2">
                      {p.holes.length ? `${p.holes.length} ${p.holes.length === 1 ? "hole" : "holes"} reported out. The check continues.` : "None reported yet."}
                    </span>
                  </Panel>
                  <Panel title="Parts on hold">
                    <div className="flex items-center gap-4">
                      <Btn onClick={() => onParts(p.parts - 1)} disabled={p.parts <= 0} aria-label="One fewer part on hold">
                        −
                      </Btn>
                      <span className="min-w-16 text-center text-[34px] font-semibold" data-testid="parts-on-hold">{p.parts}</span>
                      <Btn onClick={() => onParts(p.parts + 1)} aria-label="One more part on hold">
                        +
                      </Btn>
                      <span className="text-base text-ink-2">Parts cut since the last good check, tagged and quarantined.</span>
                    </div>
                  </Panel>
                  <Panel title="Customer notice">
                    <p className="text-[15px] text-muted">A failure on critical holes H13 and H14 may need the customer told. Plant rule applies.</p>
                  </Panel>
                </>
              )}
              {screen === 2 && (
                <>
                  <Panel title="Marking each hole">
                    <MarkingDrawing holes={p.holes} />
                    <span className="text-base text-ink-2">The photos and marks are the evidence. Do not scratch the part.</span>
                  </Panel>
                  <Panel title="If no one comes">
                    <p className="text-[15px] text-muted">After [set by plant] minutes, call the shift supervisor. Hand over to the next shift at shift end.</p>
                  </Panel>
                </>
              )}
              {screen === 3 && (
                <Panel title="After the re-check">
                  {TRIAL_OUTCOMES.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      disabled={passed || escalated || d.status !== "open"}
                      onClick={() => onTrial(o.id)}
                      className="tap flex items-center gap-3 rounded-[10px] bg-surface-2 px-3.5 py-2.5 text-left hover:bg-blue-soft disabled:cursor-default disabled:opacity-60"
                    >
                      <span aria-hidden className={cx("size-3 flex-none rounded-full", o.tone === "ok" ? "bg-primary" : o.tone === "warn" ? "bg-amber" : "bg-red")} />
                      <span className="flex flex-col">
                        <span className="text-[17px] font-semibold">{o.title}</span>
                        <span className="text-[15px] text-ink-2">{o.next}</span>
                      </span>
                    </button>
                  ))}
                  <div className="flex items-center gap-3 rounded-[10px] bg-surface-2 px-3.5 py-2.5">
                    <span aria-hidden className="size-3 flex-none rounded-full bg-red" />
                    <span className="flex flex-col">
                      <span className="text-[17px] font-semibold">Two failed trials (assumed limit)</span>
                      <span className="text-[15px] text-ink-2">Stop correcting and escalate</span>
                    </span>
                  </div>
                  <span className="text-base text-ink-2">The Quality Technician decides. FactoryLens AI does not read the readings.</span>
                  {p.trials.length > 0 && (
                    <ul className="flex flex-col gap-1 text-base text-ink-2" data-testid="trials">
                      {p.trials.map((t, i) => (
                        <li key={t.at}>
                          Trial {i + 1}: {TRIAL_OUTCOMES.find((o) => o.id === t.outcome)?.title}
                        </li>
                      ))}
                    </ul>
                  )}
                </Panel>
              )}
              {screen === 4 && (
                <Panel title="What this record will show">
                  <div>
                    <KV k="Issue" v={holesText ? `Holes ${holesText} out of position` : d.issue} />
                    <KV k="Fixed by" v="Process engineer, program revision on the tablet" />
                    <KV k="Trials used" v={`${p.trials.length} of ${MAX_TRIALS}`} />
                    <KV k="Parts on hold" v={`${p.parts}, owner: Quality`} />
                    <KV k="Time on hold" v={fmtClock(holdMs)} />
                    <KV k="Clips and photos" v={`${d.handoff.photos} photos, ${state.deviations.length} clips saved`} />
                  </div>
                  <span className="text-base text-ink-2">Shown on the supervisor dashboard later.</span>
                  {released ? (
                    <span className="text-[18px] font-semibold text-primary-ink" data-testid="hold-closed">The hold is closed.</span>
                  ) : (
                    <Btn
                      variant="success"
                      disabled={!passed || !sectionDone(d, p, "H")}
                      onClick={onClose}
                      title={passed ? "Tick every item first" : "A trial part must pass first"}
                    >
                      Close the hold
                    </Btn>
                  )}
                </Panel>
              )}
            </div>
          </div>

          <div className="flex gap-3.5">
            {screen === 3 ? (
              <>
                <Stat label="Trial" value={`${Math.max(trialNo, 1)} of ${MAX_TRIALS}`} />
                <Stat label="Points checked" value={`${points} / ${TOTAL_CHECK_POINTS}`} />
                <Stat label="Trials used" value={String(p.trials.length)} />
                <Stat label="Time on trial" value={p.trialStartedAt ? fmtClock(now - p.trialStartedAt) : "—"} />
              </>
            ) : screen === 2 ? (
              <>
                <Stat label="Marks" value={d.handoff.marks ? "Done" : "To do"} />
                <Stat label="Photos" value={String(d.handoff.photos)} />
                <Stat label="Waiting" value={waiting ? fmtClock(now - waiting) : "—"} tone="red" />
                <Stat label="Handoff sheet" value={d.handoff.sheet ? "On tablet" : "To do"} />
              </>
            ) : (
              <>
                <Stat label="Points checked" value={`${points} / ${TOTAL_CHECK_POINTS}`} tone={points === TOTAL_CHECK_POINTS ? "green" : undefined} />
                <Stat label={screen === 1 ? "Reported out" : "Time on check"} value={screen === 1 ? String(p.holes.length) : fmtClock(elapsedMs(state, now))} tone={screen === 1 ? "red" : undefined} />
                <Stat label={screen === 4 ? "Total hold time" : "Time on hold"} value={fmtClock(holdMs)} tone={screen === 4 ? undefined : "red"} />
                <Stat label="Parts on hold" value={String(p.parts)} />
              </>
            )}
          </div>

          <nav className="flex flex-wrap items-center gap-3">
            <Btn onClick={() => onScreen(screen - 1)} disabled={screen === 0}>
              Previous
            </Btn>
            <Btn variant="primary" onClick={() => onScreen(screen + 1)} disabled={screen === PROC_SCREENS.length - 1}>
              Next
            </Btn>
            <span className="text-[17px] text-ink-2" data-testid="proc-screen">
              {screen + 1} of {PROC_SCREENS.length}: {def.title}
            </span>
            <span className="flex-1" />
            <LodgeButton onClick={onLodge} />
            <Btn onClick={onBack}>Back to the check</Btn>
          </nav>
        </div>
      </div>
    </>
  );
}
