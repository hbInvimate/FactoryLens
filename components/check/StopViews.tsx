"use client";
// Holds (scenarios 4 and 6): why the session or the cell is on hold, the handoff, and recording the decision.
// The Quality Technician only records a decision made by others. The app never decides.
import Link from "next/link";
import { useState } from "react";
import { stepsDone } from "@/lib/check/reducer";
import {
  DECIDERS, HOLD_OUTCOMES, STATUS_LABEL,
  type CheckState, type Discrepancy, type HoldOutcome, type SessionMeta,
} from "@/lib/check/types";
import { fmtClock } from "@/lib/client/hooks";
import type { SyncState } from "@/lib/client/useCheckSession";
import { categoryOf } from "@/lib/issues";
import type { HandoffItem } from "@/lib/procedure";
import { stepLabel } from "@/lib/sop";
import { Banner, Btn, Chip, Frame, KV, Panel, Ring, Stat, Tick, cx } from "../ui";
import { savedChip } from "./CompleteView";
import { Modal } from "./Dialogs";
import { CallList, sessionTime } from "./LodgedView";
import { LodgeButton } from "./MainView";
import { MiniStepList } from "./StepList";

export interface DecisionInput {
  outcome: HoldOutcome;
  by: string;
  reason: string;
  decidedAt: number;
}

/** "HH:MM" today, or yesterday if that is still to come. Empty: now. */
function timeToMs(hhmm: string): number {
  const now = Date.now();
  if (!hhmm) return now;
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  if (d.getTime() > now + 60_000) d.setDate(d.getDate() - 1);
  return d.getTime();
}

function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cx("tap rounded-[var(--fl-radius-md)] border px-5 text-left text-[19px]", on ? "border-blue bg-blue-soft" : "border-line-strong")}
    >
      {children}
    </button>
  );
}

export function HoldDecisionForm({ onSubmit, onCancel }: { onSubmit: (d: DecisionInput) => void; onCancel?: () => void }) {
  const [outcome, setOutcome] = useState<HoldOutcome | null>(null);
  const [by, setBy] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [time, setTime] = useState("");
  const ready = !!outcome && !!by && reason.trim().length > 0;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSubmit({ outcome: outcome!, by: by!, reason: reason.trim(), decidedAt: timeToMs(time) });
      }}
    >
      <p className="text-base text-ink-2">Record what the people called decided. You do not decide, and neither does the app.</p>
      <fieldset className="flex flex-col gap-2">
        <legend className="pb-1.5 text-base text-muted">Outcome</legend>
        <div className="flex flex-wrap gap-2.5">
          {HOLD_OUTCOMES.map((o) => (
            <Choice key={o.id} on={outcome === o.id} onClick={() => setOutcome(o.id)}>
              {o.label}
            </Choice>
          ))}
        </div>
        {outcome && (
          <span className="text-[15px] text-muted">
            {outcome === "cleared" ? "The check carries on at the same step." : "The session ends with this outcome. It is not scored."}
          </span>
        )}
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="pb-1.5 text-base text-muted">Decision made by</legend>
        <div className="flex flex-wrap gap-2.5">
          {DECIDERS.map((w) => (
            <Choice key={w} on={by === w} onClick={() => setBy(w)}>
              {w}
            </Choice>
          ))}
        </div>
      </fieldset>
      <label className="flex flex-col gap-1.5">
        <span className="text-base text-muted">Reason (their words, required)</span>
        <textarea
          value={reason}
          maxLength={1000}
          rows={3}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-[var(--fl-radius-md)] border border-line-strong bg-surface px-4 py-3 text-[20px]"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-base text-muted">Time of the decision (leave empty for now)</span>
        <input
          type="time"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="tap w-[200px] rounded-[var(--fl-radius-md)] border border-line-strong bg-surface px-4 text-[20px]"
        />
      </label>
      <div className="flex flex-wrap justify-end gap-3">
        {onCancel && <Btn onClick={onCancel}>Cancel</Btn>}
        <Btn type="submit" variant="primary" disabled={!ready}>
          Record the decision and close the hold
        </Btn>
      </div>
    </form>
  );
}

export function HoldDecisionDialog({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (d: DecisionInput) => void }) {
  return (
    <Modal title="Record the decision" onClose={onCancel} wide>
      <HoldDecisionForm onCancel={onCancel} onSubmit={onSubmit} />
    </Modal>
  );
}

/** Why it is on hold: derived from the lodged discrepancy. */
export function HoldReason({ state, d, now }: { state: CheckState; d: Discrepancy; now: number }) {
  return (
    <Panel title="Why it is on hold">
      <div>
        <KV k="Step" v={stepLabel(d.step)} />
        <KV k="Issue" v={d.issue} />
        <KV k="Category" v={categoryOf(d.step, d.issue)} />
        <KV k="Who to call" v={d.who.length ? d.who.join(", ") : "No call needed"} />
        <KV k="The check" v={d.effect === "stop" ? "Stopped" : "Continues"} />
        <KV k="Hold started" v={sessionTime(state, d.loggedAt)} />
        <KV k="Waiting so far" v={<span data-testid="hold-waiting">{fmtClock(Math.max(0, now - d.loggedAt))}</span>} />
      </div>
    </Panel>
  );
}

const HANDOFF: { item: HandoffItem; text: string; seen: string }[] = [
  { item: "marks", text: "Mark the problem on the part. Do not scratch it", seen: "Camera" },
  { item: "photo", text: "Photograph it close up, then one wide shot", seen: "Camera" },
  { item: "sheet", text: "Fill in the handoff sheet on the tablet", seen: "Tablet" },
  { item: "handed_over", text: "Hand over in person: part, sheet, photos. Say what you saw", seen: "Reminder" },
];

export function handoffDone(d: Discrepancy, item: HandoffItem): boolean {
  const h = d.handoff;
  return item === "photo" ? h.photos > 0 : item === "marks" ? h.marks : item === "sheet" ? h.sheet : h.handedOverAt !== null;
}

export function HandoffChecklist({ d, onItem }: { d: Discrepancy; onItem: (item: HandoffItem) => void }) {
  const next = HANDOFF.findIndex((h) => !handoffDone(d, h.item));
  return (
    <Panel title="Mark and hand off">
      {HANDOFF.map((h, k) => {
        const done = handoffDone(d, h.item);
        const photo = h.item === "photo";
        return (
          <button
            key={h.item}
            type="button"
            aria-pressed={done}
            disabled={done && !photo}
            onClick={() => onItem(h.item)}
            className={cx("tap flex items-center gap-3.5 rounded-[10px] px-3 py-1.5 text-left", k === next && "bg-blue-soft")}
          >
            {done ? <Tick size={26} /> : <Ring n={k + 1} size={26} active={k === next} />}
            <span className="flex flex-1 flex-col">
              <span className={cx("text-[19px]", done && !photo && "text-muted")}>{h.text}</span>
              {photo && <span className="text-[15px] text-muted">{d.handoff.photos} {d.handoff.photos === 1 ? "photo" : "photos"}. Tap to add one.</span>}
            </span>
            <Chip small tone={h.seen === "Tablet" ? "blue" : h.seen === "Camera" ? "green" : "gray"}>
              {h.seen}
            </Chip>
          </button>
        );
      })}
    </Panel>
  );
}

/** The hold screen when the check is stopped (scenario 4). */
export function StoppedView({
  state, d, now, onItem, onCalled, onDecision, onLodge,
}: {
  state: CheckState;
  d: Discrepancy;
  now: number;
  onItem: (item: HandoffItem) => void;
  onCalled: (who: string) => void;
  onDecision: (x: DecisionInput) => void;
  onLodge: () => void;
}) {
  const waiting = d.handoff.handedOverAt;
  return (
    <>
      <Frame tone="red" />
      <Banner tone="red" title="On hold: the check is stopped" sub={`${d.issue}. Do not force anything. Keep the part clamped.`} chip={`Waiting ${fmtClock(Math.max(0, now - d.loggedAt))}`} />
      <div className="flex min-h-0 flex-1 gap-5 overflow-y-auto px-8 py-5">
        <aside className="flex w-[290px] flex-none flex-col gap-2 rounded-[14px] bg-surface px-2 py-3.5">
          <span className="px-3 text-[19px] font-semibold">SOP · locked</span>
          <span className="px-3 text-[15px] text-muted">The steps are locked until the decision is recorded.</span>
          <MiniStepList state={state} flag={d.step || undefined} />
          <div className="flex-1" />
          <div className="px-2">
            <LodgeButton onClick={onLodge} />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <HoldReason state={state} d={d} now={now} />
          <HandoffChecklist d={d} onItem={onItem} />
          <CallList d={d} onCalled={onCalled} />
          <div className="flex gap-3.5">
            <Stat label="Marks" value={d.handoff.marks ? "Done" : "To do"} />
            <Stat label="Photos" value={String(d.handoff.photos)} />
            <Stat label="Since handover" value={waiting ? fmtClock(now - waiting) : "Not handed over"} />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <Panel title="When the decision is made">
            <HoldDecisionForm onSubmit={onDecision} />
          </Panel>
          <Panel title="If no one comes">
            <p className="text-base text-ink-2">After [set by plant] minutes, call the shift supervisor. Hand over to the next shift at shift end.</p>
          </Panel>
        </div>
      </div>
    </>
  );
}

const ENDED_TITLE: Partial<Record<CheckState["status"], string>> = {
  part_held: "Part held, not checked",
  scrapped: "Part scrapped",
  rework: "Sent for rework or sorting",
  concession: "Concession approved",
  left: "Check abandoned",
};

/** A session that ended on a hold decision (or, for older sessions, as part held). Never scored. */
export function EndedView({ state, meta, sync }: { state: CheckState; meta: SessionMeta; sync: SyncState }) {
  const closing = state.final ? state.discrepancies.filter((x) => x.id === state.final!.did) : state.discrepancies.filter((x) => x.effect === "stop" && x.status !== "fixed_on_spot");
  return (
    <>
      <Frame tone="red" />
      <Banner tone="red" title={ENDED_TITLE[state.status] ?? STATUS_LABEL[state.status]} sub="Not scored. The check did not finish." chip={savedChip(sync)} />
      <div className="flex min-h-0 flex-1 gap-6 overflow-y-auto px-8 py-6">
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          {closing.map((d) => (
            <Panel key={d.id} title={d.issue}>
              <div>
                <KV k="Step" v={stepLabel(d.step)} />
                <KV k="Category" v={categoryOf(d.step, d.issue)} />
                <KV k="Hold started" v={sessionTime(state, d.loggedAt)} />
                <KV k="Called" v={d.called.length ? d.called.join(", ") : "Not marked"} />
                <KV k="Marks and photos" v={`${d.handoff.marks ? "Marked" : "Not marked"}, ${d.handoff.photos} photos`} />
                <KV k="Waited" v={d.closedAt ? fmtClock(d.closedAt - d.loggedAt) : "not recorded"} />
                <KV
                  k="Outcome"
                  v={<span data-testid="held-outcome">{d.decision ? HOLD_OUTCOMES.find((o) => o.id === d.decision!.outcome)?.label : d.status === "scrapped" ? "Part scrapped" : "Part cleared"}</span>}
                />
                <KV k="Decided by" v={d.decision?.by ?? d.clearedBy ?? "not recorded"} />
                <KV k="Reason" v={d.decision?.reason ?? d.clearReason ?? "not recorded"} />
              </div>
            </Panel>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <Panel title="Where the check ended">
            <p className="text-[18px] text-ink-2">
              {meta.part} · {meta.fixture} · {meta.operator}. {stepsDone(state)} of 12 steps done.
            </p>
            <MiniStepList state={state} short={false} />
          </Panel>
          <div className="flex gap-3">
            <Link href="/" className="tap inline-flex items-center rounded-[var(--fl-radius-md)] border border-primary bg-primary px-6 text-[20px] font-semibold text-on-strong shadow-card hover:bg-primary-hover">
              Start a new check
            </Link>
            <Link href="/sessions" className="tap inline-flex items-center rounded-[var(--fl-radius-md)] border border-line-strong bg-surface px-6 text-[20px] font-semibold shadow-card hover:bg-surface-2">
              Past sessions
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
