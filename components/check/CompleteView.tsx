"use client";
import Link from "next/link";
import { useState } from "react";
import { checkPointsDone, conformance, correctFirstTime, elapsedMs, openHolds } from "@/lib/check/reducer";
import { deviationText, fixedLine } from "@/lib/check/text";
import type { CheckState } from "@/lib/check/types";
import { fmtClock } from "@/lib/client/hooks";
import type { SyncState } from "@/lib/client/useCheckSession";
import { STEPS, TOTAL_CHECK_POINTS } from "@/lib/sop";
import { Banner, Btn, Chip, Frame, TabletIcon, Tick, Tile, Warn } from "../ui";
import { ClipDialog } from "./Dialogs";
import { LodgeButton } from "./MainView";

export function savedChip(sync: SyncState): string {
  if (sync.pending || sync.saving) return sync.offline ? "Saved on this device" : "Saving…";
  if (sync.error) return "Not saved yet";
  return "Session saved";
}

export function CompleteView({
  state, now, sync, onOpenHold, onLodge,
}: {
  state: CheckState;
  now: number;
  sync: SyncState;
  onOpenHold: (did: string) => void;
  onLodge: () => void;
}) {
  const [clip, setClip] = useState<string | null>(null);
  const conf = conformance(state) ?? 0;
  const holds = openHolds(state);
  const lodged = state.discrepancies.filter((d) => d.status !== "fixed_on_spot");

  return (
    <>
      <Frame tone={holds.length ? "amber" : "green"} />
      {holds.length ? (
        <Banner tone="amber" title="Check complete, cell on hold" sub="The hold must be cleared before the cell is released" chip={savedChip(sync)} />
      ) : (
        <Banner tone="green" title="Check complete" sub="Sign off on the tablet to release the cell" chip={savedChip(sync)} />
      )}
      <div className="flex min-h-0 flex-1 gap-6 overflow-y-auto px-8 py-6">
        <section className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-[14px] bg-panel2 px-4 py-5">
          <div className="flex items-baseline justify-between px-3.5 pb-3">
            <h2 className="text-2xl font-semibold">Every step, in order</h2>
            <span className="text-[18px] text-muted">12 of 12 done</span>
          </div>
          {STEPS.map((s) => {
            const r = state.steps[s.n - 1];
            const corrected = r.outcome === "corrected";
            return (
              <div key={s.n} className="flex min-h-11 items-center gap-3.5 px-3.5" data-testid={`result-step-${s.n}`}>
                <Tick tone={corrected ? "amber" : "green"} />
                <span className="flex-1 text-[19px]">{s.name}</span>
                {corrected ? <Chip tone="amber">Corrected</Chip> : <span className="text-base text-muted">Correct</span>}
              </div>
            );
          })}
        </section>

        <div className="flex min-w-0 flex-[1.1] flex-col gap-4">
          <div className="flex gap-4">
            <div className="flex flex-[1.2] flex-col gap-1 rounded-[14px] bg-panel px-[22px] py-[18px]">
              <span className="text-[17px] text-muted">Sequence conformance</span>
              <span className="text-[96px] font-semibold leading-none text-green" data-testid="conformance">
                {conf}%
              </span>
              <span className="text-base text-muted">{correctFirstTime(state)} of 12 steps correct first time</span>
            </div>
            <div className="grid flex-1 grid-cols-2 gap-3">
              <Tile label="Time" value={fmtClock(elapsedMs(state, now))} sub="Target: [set by plant]" />
              <Tile
                label="Deviations"
                value={String(state.deviations.length)}
                sub={state.deviations.length ? "All corrected" : "None"}
                tone={state.deviations.length ? "amber" : "green"}
              />
              <Tile label="Check points" value={`${checkPointsDone(state)} / ${TOTAL_CHECK_POINTS}`} sub="All covered" />
              <Tile label="Clips saved" value={String(state.deviations.length)} sub="On the dashboard" />
            </div>
          </div>

          {holds.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl border-2 border-amber bg-panel px-5 py-3">
              {holds.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-3">
                  <Warn size={24} />
                  <span className="flex-1 text-[18px]">
                    Cell on hold: {d.issue}{d.status === "escalated" ? " (escalated)" : ""}
                  </span>
                  <Btn variant="amber" onClick={() => onOpenHold(d.id)}>
                    Open the hold
                  </Btn>
                </div>
              ))}
            </div>
          )}

          <h2 className="pt-1 text-[22px] font-semibold">What went wrong</h2>
          {state.deviations.length === 0 && <p className="text-[18px] text-soft">No deviations. Every step was correct first time.</p>}
          {state.deviations.map((d) => {
            const t = deviationText(d);
            return (
              <div key={d.id} className="flex items-center gap-4 rounded-xl bg-panel px-[18px] py-3.5">
                <Warn size={26} />
                <div className="flex flex-1 flex-col gap-0.5">
                  <span className="text-[19px] font-semibold">{t.log}</span>
                  <span className="text-base text-soft">{t.must}</span>
                  <span className="text-[15px] text-muted">{fixedLine(d)}</span>
                </div>
                <Btn className="rounded-full text-base" onClick={() => setClip(t.log)}>
                  View clip
                </Btn>
              </div>
            );
          })}

          {lodged.length > 0 && (
            <>
              <h2 className="pt-1 text-[22px] font-semibold">Lodged discrepancies</h2>
              {lodged.map((d) => (
                <div key={d.id} className="flex items-center gap-4 rounded-xl bg-panel px-[18px] py-3">
                  <span className="flex-1 text-[18px]">
                    Step {d.step || "—"}: {d.issue}
                  </span>
                  <Chip tone={d.status === "open" || d.status === "escalated" ? "amber" : "green"}>{d.status.replace("_", " ")}</Chip>
                </div>
              ))}
            </>
          )}

          <div className="flex-1" />
          <div className="flex items-center gap-4 rounded-xl bg-panel px-5 py-4">
            <TabletIcon />
            <div className="flex flex-col gap-0.5">
              <span className="text-[18px] font-medium">Next, on the tablet</span>
              <span className="text-base text-soft">Enter any remaining readings, then sign off. FactoryLens AI does not release the cell.</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <LodgeButton onClick={onLodge} />
            <span className="flex-1" />
            <Link href="/" className="tap inline-flex items-center rounded-xl border-2 border-blue bg-blue px-6 text-[20px] font-semibold text-blue-ink">
              Start a new check
            </Link>
            <Link href="/sessions" className="tap inline-flex items-center rounded-xl border-2 border-edge px-6 text-[20px] font-semibold">
              Session history
            </Link>
          </div>
        </div>
      </div>
      {clip && <ClipDialog title={clip} onClose={() => setClip(null)} />}
    </>
  );
}
