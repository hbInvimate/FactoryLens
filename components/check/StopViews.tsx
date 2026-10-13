"use client";
// Scenario 4: the part or fixture is bad and the check cannot continue.
// Mark and photograph, hand off, wait, then record who cleared or scrapped it. The part is held, not checked.
import Link from "next/link";
import { useState } from "react";
import { stepsDone } from "@/lib/check/reducer";
import type { CheckState, ClearOutcome, Discrepancy, SessionMeta } from "@/lib/check/types";
import { fmtClock } from "@/lib/client/hooks";
import type { SyncState } from "@/lib/client/useCheckSession";
import type { HandoffItem } from "@/lib/procedure";
import { stepLabel } from "@/lib/sop";
import { Banner, Btn, Chip, Frame, KV, Panel, Ring, Stat, Tick, cx } from "../ui";
import { savedChip } from "./CompleteView";
import { Modal } from "./Dialogs";
import { CallList, sessionTime } from "./LodgedView";
import { LodgeButton } from "./MainView";
import { MiniStepList } from "./StepList";

function ClearFields({
  d, onSubmit, submit, onCancel,
}: {
  d: Discrepancy;
  onSubmit: (who: string, outcome: ClearOutcome, reason: string) => void;
  submit: string;
  onCancel?: () => void;
}) {
  const options = [...d.who, "Someone else"];
  const [who, setWho] = useState<string | null>(null);
  const [other, setOther] = useState("");
  const [outcome, setOutcome] = useState<ClearOutcome | null>(d.effect === "stop" ? null : "cleared");
  const [reason, setReason] = useState("");
  const name = who === "Someone else" ? other.trim() : who;
  const ready = !!name && !!outcome && reason.trim().length > 0;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSubmit(name!, outcome!, reason.trim());
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="pb-1.5 text-base text-muted">Who came</legend>
        <div className="flex flex-wrap gap-2.5">
          {options.map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={who === o}
              onClick={() => setWho(o)}
              className={cx("tap rounded-xl border-2 px-5 text-[19px]", who === o ? "border-blue bg-sel" : "border-edge")}
            >
              {o}
            </button>
          ))}
        </div>
        {who === "Someone else" && (
          <input
            aria-label="Name or role"
            placeholder="Name or role"
            value={other}
            maxLength={120}
            onChange={(e) => setOther(e.target.value)}
            className="tap rounded-xl border-2 border-line2 bg-deep px-4 text-[20px]"
          />
        )}
      </fieldset>
      {d.effect === "stop" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-1.5 text-base text-muted">What they decided</legend>
          <div className="flex flex-wrap gap-2.5">
            {(["cleared", "scrapped"] as const).map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={outcome === o}
                onClick={() => setOutcome(o)}
                className={cx("tap rounded-xl border-2 px-5 text-[19px]", outcome === o ? "border-blue bg-sel" : "border-edge")}
              >
                {o === "cleared" ? "Part cleared" : "Part scrapped"}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-base text-muted">Why (their words)</span>
        <textarea
          value={reason}
          maxLength={1000}
          rows={3}
          onChange={(e) => setReason(e.target.value)}
          className="rounded-xl border-2 border-line2 bg-deep px-4 py-3 text-[20px]"
        />
      </label>
      <div className="flex flex-wrap justify-end gap-3">
        {onCancel && <Btn onClick={onCancel}>Cancel</Btn>}
        <Btn type="submit" variant="primary" disabled={!ready}>
          {submit}
        </Btn>
      </div>
    </form>
  );
}

export function ClearDialog({
  d, title, submit, onCancel, onSubmit,
}: {
  d: Discrepancy;
  title: string;
  submit: string;
  onCancel: () => void;
  onSubmit: (who: string, outcome: ClearOutcome, reason: string) => void;
}) {
  return (
    <Modal title={title} onClose={onCancel} wide>
      <ClearFields d={d} submit={submit} onCancel={onCancel} onSubmit={onSubmit} />
    </Modal>
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
            className={cx("tap flex items-center gap-3.5 rounded-[10px] px-3 py-1.5 text-left", k === next && "bg-sel")}
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

export function StoppedView({
  state, d, now, onItem, onCalled, onClear, onLodge,
}: {
  state: CheckState;
  d: Discrepancy;
  now: number;
  onItem: (item: HandoffItem) => void;
  onCalled: (who: string) => void;
  onClear: (who: string, outcome: ClearOutcome, reason: string) => void;
  onLodge: () => void;
}) {
  const waiting = d.handoff.handedOverAt;
  const chip = waiting ? `Waiting ${fmtClock(now - waiting)}` : `Logged ${sessionTime(state, d.loggedAt)}`;
  return (
    <>
      <Frame tone="red" />
      <Banner tone="red" title="Check stopped" sub={`${d.issue}. Do not force anything. Keep the part clamped.`} chip={chip} />
      <div className="flex min-h-0 flex-1 gap-5 overflow-y-auto px-8 py-5">
        <aside className="flex w-[290px] flex-none flex-col gap-2 rounded-[14px] bg-panel2 px-2 py-3.5">
          <span className="px-3 text-[19px] font-semibold">SOP · locked</span>
          <span className="px-3 text-[15px] text-muted">The steps are locked until someone clears this.</span>
          <MiniStepList state={state} flag={d.step || undefined} />
          <div className="flex-1" />
          <div className="px-2">
            <LodgeButton onClick={onLodge} />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <HandoffChecklist d={d} onItem={onItem} />
          <CallList d={d} onCalled={onCalled} />
          <div className="flex gap-3.5">
            <Stat label="Marks" value={d.handoff.marks ? "Done" : "To do"} />
            <Stat label="Photos" value={String(d.handoff.photos)} />
            <Stat label="Waiting" value={waiting ? fmtClock(now - waiting) : "Not handed over"} tone={waiting ? "red" : undefined} />
            <Stat label="Handoff sheet" value={d.handoff.sheet ? "On tablet" : "To do"} />
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <Panel title="When someone arrives">
            <p className="text-base text-soft">
              Record who came and what they decided. The check then ends as &quot;Part held, not checked&quot;. There is no conformance score.
            </p>
            <ClearFields d={d} submit="Record and end the check" onSubmit={onClear} />
          </Panel>
          <Panel title="If no one comes">
            <p className="text-base text-soft">After [set by plant] minutes, call the shift supervisor. Hand over to the next shift at shift end.</p>
          </Panel>
        </div>
      </div>
    </>
  );
}

export function PartHeldView({
  state, meta, sync,
}: {
  state: CheckState;
  meta: SessionMeta;
  sync: SyncState;
}) {
  const held = state.discrepancies.filter((x) => x.effect === "stop" && x.status !== "fixed_on_spot");
  return (
    <>
      <Frame tone="red" />
      <Banner tone="red" title="Part held, not checked" sub="No conformance score. The part was not checked." chip={savedChip(sync)} />
      <div className="flex min-h-0 flex-1 gap-6 overflow-y-auto px-8 py-6">
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          {held.map((d) => (
            <Panel key={d.id} title={d.issue}>
              <div>
                <KV k="Step" v={stepLabel(d.step)} />
                <KV k="Logged at" v={sessionTime(state, d.loggedAt)} />
                <KV k="Called" v={d.called.length ? d.called.join(", ") : "Not marked"} />
                <KV k="Marks" v={d.handoff.marks ? "Done" : "Not done"} />
                <KV k="Photos" v={String(d.handoff.photos)} />
                <KV k="Handoff sheet" v={d.handoff.sheet ? "Done" : "Not done"} />
                <KV
                  k="Waiting time"
                  v={d.handoff.handedOverAt && d.closedAt ? fmtClock(d.closedAt - d.handoff.handedOverAt) : "Not handed over"}
                />
                <KV k="Outcome" v={<span data-testid="held-outcome">{d.status === "scrapped" ? "Part scrapped" : "Part cleared"}</span>} />
                <KV k="By" v={d.clearedBy ?? ""} />
                <KV k="Why" v={d.clearReason ?? ""} />
              </div>
            </Panel>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <Panel title="Where the check stopped">
            <p className="text-[18px] text-soft">
              {meta.part} · {meta.fixture} · {meta.operator}. {stepsDone(state)} of 12 steps done before it stopped.
            </p>
            <MiniStepList state={state} short={false} />
          </Panel>
          <div className="flex gap-3">
            <Link href="/" className="tap inline-flex items-center rounded-xl border-2 border-blue bg-blue px-6 text-[20px] font-semibold text-blue-ink">
              Start a new check
            </Link>
            <Link href="/sessions" className="tap inline-flex items-center rounded-xl border-2 border-edge px-6 text-[20px] font-semibold">
              Session history
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
